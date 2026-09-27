import hashlib
import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path
import httpx
from .context import write_context
from .qa import normalize, one_page, QAError, factual_report
from .sources import Sources
from .profiles import profiles


class CostLimitError(RuntimeError):
    pass


def _usage(response):
    usage = getattr(response, 'usage', None)
    if not usage:
        return {'input': 0, 'cached': 0, 'uncached': 0, 'output': 0, 'reasoning': 0, 'cost': 0.0}
    inp = getattr(usage, 'input_tokens', 0) or 0
    out = getattr(usage, 'output_tokens', 0) or 0
    input_details = getattr(usage, 'input_tokens_details', None)
    output_details = getattr(usage, 'output_tokens_details', None)
    cached = (getattr(input_details, 'cached_tokens', 0) or 0) if input_details else 0
    reasoning = (getattr(output_details, 'reasoning_tokens', 0) or 0) if output_details else 0
    # Retain the repository's existing planning prices so historical cost figures remain comparable.
    cost = (max(inp - cached, 0) * 4.0 + cached * 0.4 + out * 20.0) / 1_000_000
    return {
        'input': inp,
        'cached': cached,
        'uncached': max(inp - cached, 0),
        'output': out,
        'reasoning': reasoning,
        'cost': round(cost, 6),
    }


def _hash(text):
    return hashlib.sha256(str(text).encode('utf-8')).hexdigest()


def _safe(text):
    return re.sub(r'[\\/:*?"<>|]+', '-', str(text)).strip().strip('.')[:120] or 'Unknown'


def _transient(error):
    status = getattr(error, 'status_code', None)
    if status in {408, 409, 429} or (isinstance(status, int) and status >= 500):
        return True
    return isinstance(error, (TimeoutError, ConnectionError, httpx.TimeoutException, httpx.NetworkError))


def _now():
    return datetime.now(timezone.utc).isoformat()


class Workflow:
    def __init__(self, settings, freshmal, drive, ai, prompts):
        self.s = settings
        self.sheet = freshmal
        self.drive = drive
        self.ai = ai
        self.prompts = prompts
        self.sources = Sources(drive, settings)
        self.profiles = profiles()

    def retry(self, fn, label='operation'):
        for attempt in range(self.s.max_retries + 1):
            try:
                return fn()
            except Exception as error:
                print(
                    f'[workflow] {label} attempt {attempt + 1}/{self.s.max_retries + 1} '
                    f'failed: {type(error).__name__}: {error}',
                    flush=True,
                )
                if attempt >= self.s.max_retries or not _transient(error):
                    raise
                time.sleep(min(2 ** (attempt + 1), 10))

    def _folders(self, app):
        # Required hierarchy: Outputs / Candidate / Company / Designation, Location.
        candidate, _ = self.drive.folder(app.folder_name, self.s.drive_output_folder_id)
        company, _ = self.drive.folder(_safe(app.company), candidate)
        role_name = _safe(f'{app.designation}, {app.location}' if app.location else app.designation)
        role, link = self.drive.folder(role_name, company)
        return role, link

    def _manifest(self, folder, work):
        path = work / 'run_manifest.json'
        self.drive.download_if_exists('run_manifest.json', folder, path)
        if not path.exists():
            return {}, path
        try:
            return json.loads(path.read_text(encoding='utf-8')), path
        except Exception:
            return {}, path

    def _save_manifest(self, manifest, path, folder):
        path.write_text(json.dumps(manifest, indent=2, sort_keys=True), encoding='utf-8')
        self.drive.upload(path, folder)

    def _record_usage(self, manifest, stage, stage_usage):
        event = {
            'timestamp_utc': _now(),
            'github_run_id': os.getenv('GITHUB_RUN_ID', ''),
            'stage': stage,
            **stage_usage,
        }
        manifest.setdefault('usage_history', []).append(event)
        manifest.setdefault('latest_stage_usage', {})[stage] = stage_usage
        manifest['cumulative_cost_usd'] = round(float(manifest.get('cumulative_cost_usd', 0) or 0) + stage_usage['cost'], 6)
        return manifest['cumulative_cost_usd']

    def _guard(self, manifest):
        total = float(manifest.get('cumulative_cost_usd', 0) or 0)
        if total > self.s.cost_hard_stop_usd:
            raise CostLimitError(
                f'Cumulative estimated application cost ${total:.2f} exceeds hard stop '
                f'${self.s.cost_hard_stop_usd:.2f}.'
            )
        return total

    def _checkpoint_key_stage1(self, app, prompt1):
        return {
            'candidate': app.candidate_key,
            'jd_hash': app.jd_hash,
            'prompt1_hash': _hash(prompt1),
        }

    def _checkpoint_key_stage2(self, stage1_key, prompt2, summary, stage1_output):
        return {
            **stage1_key,
            'prompt2_hash': _hash(prompt2),
            'summary_hash': _hash(summary),
            'stage1_output_hash': _hash(stage1_output),
        }

    @staticmethod
    def _matches(manifest, key):
        return all(manifest.get(k) == v for k, v in key.items())

    def run(self, app):
        print(f'[workflow] Starting {app.candidate_key} application: {app.company} - {app.designation}', flush=True)
        if not self.sheet.prepare(app):
            return

        errors = app.validate()
        profile = self.profiles[app.candidate_key]
        missing = profile.missing_required()
        if missing:
            errors.append(f'{app.candidate_name} profile is missing required configuration: {", ".join(missing)}.')
        if errors:
            message = ' '.join(errors)
            self.sheet.fail(app, message, 'ERROR_CONFIG')
            raise RuntimeError(message)

        self.sheet.claim(app)
        work = Path(self.s.workdir) / app.application_id
        work.mkdir(parents=True, exist_ok=True)
        current_stage = 'INITIALISING'
        folder = None

        try:
            folder, _ = self._folders(app)
            prompt1 = self.prompts.read(app.candidate_key, '#Prompt1.md', work)
            prompt2 = self.prompts.read(app.candidate_key, '#Prompt2.md', work)
            prompt3 = self.prompts.read(app.candidate_key, '#Prompt3.md', work)
            manifest, manifest_path = self._manifest(folder, work)
            manifest.setdefault('schema_version', 2)
            manifest.setdefault('candidate', app.candidate_key)
            manifest.setdefault('application_id', app.application_id)
            manifest.setdefault('cumulative_cost_usd', 0.0)

            # ---------------- Stage 1 ----------------
            current_stage = 'STAGE_1'
            self.sheet.update(app, {'workflow': current_stage})
            stage1_path = work / 'stage1.md'
            stage1_key = self._checkpoint_key_stage1(app, prompt1)
            stage1_valid = (
                self._matches(manifest, stage1_key)
                and manifest.get('stage1_complete') is True
                and self.drive.download_if_exists('stage1.md', folder, stage1_path)
            )
            if stage1_valid:
                stage1 = stage1_path.read_text(encoding='utf-8')
                print('[workflow] Reusing verified Stage 1 checkpoint', flush=True)
            else:
                # A changed JD/Prompt 1 invalidates downstream checkpoints, but historical usage remains auditable.
                for key in ('stage1_complete', 'stage2_complete', 'stage3_complete', 'stage2_key'):
                    manifest.pop(key, None)
                manifest.update(stage1_key)
                input1 = (
                    f'Company: {app.company}\nDesignation: {app.designation}\nLink: {app.application_link}'
                    f'\n\nRAW JOB DESCRIPTION\n{app.raw_jd}'
                )
                stage1, response1 = self.retry(
                    lambda: self.ai.text(
                        prompt1,
                        input1,
                        self.s.stage1_reasoning_effort,
                        self.s.stage1_max_output_tokens,
                    ),
                    'Stage 1 AI call',
                )
                stage1_path.write_text(stage1, encoding='utf-8')
                self.drive.upload(stage1_path, folder)
                manifest['stage1_complete'] = True
                self._record_usage(manifest, 'stage1', _usage(response1))
                self._save_manifest(manifest, manifest_path, folder)
                self._guard(manifest)

            # ---------------- Stage 2 ----------------
            current_stage = 'STAGE_2'
            self.sheet.update(app, {'workflow': current_stage})
            summary, summary_path = self.sources.stage2(app.candidate_key, work)
            stage2_key = self._checkpoint_key_stage2(stage1_key, prompt2, summary, stage1)
            stage2_path = work / 'stage2.md'
            stage2_valid = (
                manifest.get('stage2_key') == stage2_key
                and manifest.get('stage2_complete') is True
                and self.drive.download_if_exists('stage2.md', folder, stage2_path)
            )
            if stage2_valid:
                stage2 = stage2_path.read_text(encoding='utf-8')
                print('[workflow] Reusing verified Stage 2 checkpoint', flush=True)
            else:
                manifest.pop('stage2_complete', None)
                manifest.pop('stage3_complete', None)
                # Stable candidate evidence deliberately comes before job-specific material to improve cache eligibility.
                input2 = (
                    f'COMPLETE SUMMARY DOC\n{summary}'
                    f'\n\nRAW JOB DESCRIPTION\n{app.raw_jd}'
                    f'\n\nCOMPLETE STAGE 1 OUTPUT\n{stage1}'
                )
                stage2, response2 = self.retry(
                    lambda: self.ai.text(
                        prompt2,
                        input2,
                        self.s.stage2_reasoning_effort,
                        self.s.stage2_max_output_tokens,
                    ),
                    'Stage 2 AI call',
                )
                stage2_path.write_text(stage2, encoding='utf-8')
                self.drive.upload(stage2_path, folder)
                manifest['stage2_key'] = stage2_key
                manifest['stage2_complete'] = True
                self._record_usage(manifest, 'stage2', _usage(response2))
                self._save_manifest(manifest, manifest_path, folder)
                self._guard(manifest)

            # ---------------- Stage 3 ----------------
            current_stage = 'STAGE_3'
            self.sheet.update(app, {'workflow': current_stage})
            source_paths = self.sources.stage3(app.candidate_key, work, summary_path, stage2)
            controls = (
                f'MAKE_CV = TRUE\nMAKE_COVER_LETTER = {str(app.make_cl).upper()}'
                f'\nWEB_SEARCH = {str(app.web_search).upper()}'
            )
            input3 = (
                f'{controls}\n\nCompany: {app.company}\nRole: {app.designation}\nLocation: {app.location}'
                f'\nLink: {app.application_link}\n\nRAW JOB DESCRIPTION\n{app.raw_jd}'
                f'\n\nCOMPLETE STAGE 1 OUTPUT\n{stage1}'
                f'\n\nCOMPLETE STAGE 2 OUTPUT\n{stage2}'
                '\n\nUse supplied source files with the Python tool and create the required Word artifact(s).'
            )
            stage3, response3, artifacts = self.retry(
                lambda: self.ai.stage3(
                    prompt3,
                    input3,
                    source_paths,
                    work / 'generated',
                    app.web_search,
                    self.s.stage3_reasoning_effort,
                    self.s.stage3_max_output_tokens,
                ),
                'Stage 3 AI/artifact call',
            )
            stage3_path = work / 'stage3.md'
            stage3_path.write_text(stage3, encoding='utf-8')
            self.drive.upload(stage3_path, folder)
            manifest['prompt3_hash'] = _hash(prompt3)
            manifest['stage3_started'] = True
            self._record_usage(manifest, 'stage3', _usage(response3))
            self._save_manifest(manifest, manifest_path, folder)
            self._guard(manifest)

            # ---------------- Normalize / QA ----------------
            current_stage = 'NORMALIZE'
            final = work / 'final'
            company = _safe(app.company)
            role = _safe(app.designation)
            cv, cover_letter = normalize(
                artifacts,
                f'{app.filename_name}_{company}_{role}_CV.docx',
                f'{app.filename_name}_{company}_{role}_Cover_Letter.docx' if app.make_cl else None,
                final,
            )

            current_stage = 'QA'
            self.sheet.update(app, {'workflow': current_stage})
            one_page(cv, work / 'rendered')
            if cover_letter:
                one_page(cover_letter, work / 'rendered')

            # Summary Doc is the strict factual source of truth for high-risk CV claims.
            qa_report = factual_report(cv, summary, work / 'Factual_QA.md')
            self.drive.upload(work / 'Factual_QA.md', folder)
            if qa_report['critical']:
                raise QAError(
                    'Factual QA found unsupported high-risk claims: '
                    + '; '.join(qa_report['critical'][:8])
                )

            # ---------------- Final uploads ----------------
            current_stage = 'DRIVE_UPLOAD'
            _, cv_link = self.drive.upload(cv, folder)
            cl_link = ''
            if cover_letter:
                _, cl_link = self.drive.upload(cover_letter, folder)

            current_cost = float(manifest.get('cumulative_cost_usd', 0) or 0)
            usage_path = work / 'Token_Usage.json'
            usage_path.write_text(json.dumps({
                'candidate': app.candidate_key,
                'application_id': app.application_id,
                'cumulative_cost_usd': current_cost,
                'latest_stage_usage': manifest.get('latest_stage_usage', {}),
                'usage_history': manifest.get('usage_history', []),
            }, indent=2), encoding='utf-8')
            self.drive.upload(usage_path, folder)

            context = write_context(work / 'Application_Context.md', app, stage1, stage2, stage3, cv, cv_link)
            _, context_link = self.drive.upload(context, folder)

            manifest.update({
                'candidate': app.candidate_key,
                'application_id': app.application_id,
                'jd_hash': app.jd_hash,
                'prompt1_hash': _hash(prompt1),
                'prompt2_hash': _hash(prompt2),
                'prompt3_hash': _hash(prompt3),
                'summary_hash': _hash(summary),
                'stage1_complete': True,
                'stage2_complete': True,
                'stage3_complete': True,
                'complete': True,
                'completed_at_utc': _now(),
                'cv_link': cv_link,
                'cl_link': cl_link,
            })
            self._save_manifest(manifest, manifest_path, folder)
            self.sheet.done(app, cv_link, cl_link, context_link, current_cost)
            print(f'[workflow] COMPLETE: {app.application_id}; cumulative cost=${current_cost:.4f}', flush=True)

        except CostLimitError as error:
            self.sheet.fail(app, f'{current_stage}: {error}', 'ERROR_MANUAL')
            raise
        except QAError as error:
            self.sheet.fail(app, f'{current_stage}: {error}', 'ERROR_MANUAL')
            raise
        except Exception as error:
            self.sheet.fail(app, f'{current_stage}: {type(error).__name__}: {error}')
            raise
