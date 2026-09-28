import hashlib
import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx

from .context import write_context
from .profiles import profiles
from .qa import QAError, factual_report, normalize, one_page
from .sources import Sources, source_telemetry


class CostLimitError(RuntimeError):
    pass


_MODEL_PRICES_PER_M = {
    'gpt-5.6-sol': {'input': 4.0, 'cached': 0.4, 'cache_write': 5.0, 'output': 20.0},
    'gpt-5.6': {'input': 4.0, 'cached': 0.4, 'cache_write': 5.0, 'output': 20.0},
    'gpt-5.6-terra': {'input': 2.0, 'cached': 0.2, 'cache_write': 2.5, 'output': 12.0},
}

_TOOL_PRICES_USD = {
    'web_search_call': 0.01,
    'code_interpreter_1gb_session': 0.03,
}

_CHECKPOINT_SCHEMA_VERSION = 5
_CHECKPOINT_ROOT = '_Resume_Checkpoints'


def _as_dict(value):
    if isinstance(value, dict):
        return value
    if hasattr(value, 'model_dump'):
        return value.model_dump()
    return {}


def _tool_usage(response):
    web_search_calls = 0
    code_interpreter_calls = 0
    container_ids = set()
    for item in getattr(response, 'output', None) or []:
        data = _as_dict(item)
        kind = data.get('type') or getattr(item, 'type', None)
        if kind == 'web_search_call':
            action = data.get('action') or getattr(item, 'action', None)
            action_data = _as_dict(action)
            action_type = action_data.get('type') or getattr(action, 'type', None)
            if action_type in (None, 'search'):
                web_search_calls += 1
        elif kind == 'code_interpreter_call':
            code_interpreter_calls += 1
            container_id = data.get('container_id') or getattr(item, 'container_id', None)
            if container_id:
                container_ids.add(container_id)
    container_sessions = len(container_ids) if container_ids else (1 if code_interpreter_calls else 0)
    tool_cost = (
        web_search_calls * _TOOL_PRICES_USD['web_search_call']
        + container_sessions * _TOOL_PRICES_USD['code_interpreter_1gb_session']
    )
    return {
        'web_search_calls': web_search_calls,
        'code_interpreter_calls': code_interpreter_calls,
        'code_interpreter_sessions': container_sessions,
        'tool_cost_estimate': round(tool_cost, 6),
    }


def _usage(response, model=None):
    usage = getattr(response, 'usage', None)
    response_model = model or getattr(response, 'model', '') or ''
    prices = _MODEL_PRICES_PER_M.get(response_model)
    tool_usage = _tool_usage(response)
    if not usage:
        return {
            'model': response_model,
            'input': 0,
            'cached': 0,
            'cache_write': 0,
            'uncached': 0,
            'standard_input': 0,
            'output': 0,
            'reasoning': 0,
            'model_api_cost': 0.0,
            **tool_usage,
            'cost': tool_usage['tool_cost_estimate'],
        }
    inp = getattr(usage, 'input_tokens', 0) or 0
    out = getattr(usage, 'output_tokens', 0) or 0
    input_details = getattr(usage, 'input_tokens_details', None)
    output_details = getattr(usage, 'output_tokens_details', None)
    cached = (getattr(input_details, 'cached_tokens', 0) or 0) if input_details else 0
    cache_write = (getattr(input_details, 'cache_write_tokens', 0) or 0) if input_details else 0
    reasoning = (getattr(output_details, 'reasoning_tokens', 0) or 0) if output_details else 0
    standard_input = max(inp - cached - cache_write, 0)
    uncached = max(inp - cached, 0)
    model_api_cost = 0.0
    if prices:
        model_api_cost = (
            standard_input * prices['input']
            + cached * prices['cached']
            + cache_write * prices['cache_write']
            + out * prices['output']
        ) / 1_000_000
    total_cost = model_api_cost + tool_usage['tool_cost_estimate']
    return {
        'model': response_model,
        'input': inp,
        'cached': cached,
        'cache_write': cache_write,
        'uncached': uncached,
        'standard_input': standard_input,
        'output': out,
        'reasoning': reasoning,
        'model_api_cost': round(model_api_cost, 6),
        **tool_usage,
        'cost': round(total_cost, 6),
    }


def _hash(text):
    return hashlib.sha256(str(text).encode('utf-8')).hexdigest()


def _file_hash(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def _source_hashes(paths):
    return {f'{i}:{Path(p).name}': _file_hash(p) for i, p in enumerate(paths)}


def _safe(text):
    return re.sub(r'[\\/:*?"<>|]+', '-', str(text)).strip().strip('.')[:120] or 'Unknown'


def _transient(error):
    status = getattr(error, 'status_code', None)
    if status in {408, 409, 429} or (isinstance(status, int) and status >= 500):
        return True
    return isinstance(error, (TimeoutError, ConnectionError, httpx.TimeoutException, httpx.NetworkError))


def _qa_requires_regeneration(error):
    message = str(error)
    return 'rendered to ' in message and 'pages; expected 1.' in message


def _now():
    return datetime.now(timezone.utc).isoformat()


def _extract_handoff(text, marker):
    text = str(text or '')
    fenced_marker = re.search(
        rf'(?is)```(?:ya?ml|json)?\s*\n\s*{re.escape(marker)}\s*:?\s*\n(?P<body>.*?)\n```',
        text,
    )
    if fenced_marker and fenced_marker.group('body').strip():
        return f'{marker}\n{fenced_marker.group("body").strip()}'
    heading = re.search(
        rf'(?im)^\s*(?:#+\s*)?(?:\d+\.\s*)?{re.escape(marker)}\s*:?\s*$',
        text,
    )
    if not heading:
        raise RuntimeError(f'{marker} was not found in the model output.')
    tail = text[heading.end():]
    fenced = re.search(r'(?is)```(?:ya?ml|json)?\s*\n(?P<body>.*?)\n```', tail)
    if fenced and fenced.group('body').strip():
        return f'{marker}\n{fenced.group("body").strip()}'
    body = re.split(r'(?m)^\s*#{1,6}\s+', tail, maxsplit=1)[0].strip()
    if body:
        return f'{marker}\n{body}'
    raise RuntimeError(f'{marker} was found but its handoff body was empty.')


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
        candidate, _ = self.drive.folder(app.folder_name, self.s.drive_output_folder_id)
        company, _ = self.drive.folder(_safe(app.company), candidate)
        role_name = _safe(f'{app.designation}, {app.location}' if app.location else app.designation)
        role, link = self.drive.folder(role_name, company)
        return role, link

    def _checkpoint_folder(self, role_folder, name):
        root, _ = self.drive.folder(_CHECKPOINT_ROOT, role_folder)
        child, _ = self.drive.folder(name, root)
        return child

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

    @staticmethod
    def _invalidate_from(manifest, phase):
        downstream_stage3 = (
            'stage3_key', 'stage3_complete', 'stage3_artifacts', 'stage3_started',
            'stage3_sources', 'stage3_effective_prompt_hash',
            'normalize_key', 'normalize_complete', 'normalized_cv_name', 'normalized_cl_name',
            'qa_key', 'qa_complete',
            'drive_upload_key', 'drive_upload_complete', 'cv_link', 'cl_link',
            'complete', 'completed_at_utc', 'context_link',
        )
        phase_keys = {
            'stage1': ('stage1_complete', 'stage2_key', 'stage2_complete', *downstream_stage3),
            'stage2': ('stage2_key', 'stage2_complete', *downstream_stage3),
            'stage3': downstream_stage3,
            'normalize': (
                'normalize_key', 'normalize_complete', 'normalized_cv_name', 'normalized_cl_name',
                'qa_key', 'qa_complete', 'drive_upload_key', 'drive_upload_complete',
                'cv_link', 'cl_link', 'complete', 'completed_at_utc', 'context_link',
            ),
            'qa': (
                'qa_key', 'qa_complete', 'drive_upload_key', 'drive_upload_complete',
                'cv_link', 'cl_link', 'complete', 'completed_at_utc', 'context_link',
            ),
            'drive_upload': (
                'drive_upload_key', 'drive_upload_complete', 'cv_link', 'cl_link',
                'complete', 'completed_at_utc', 'context_link',
            ),
        }
        if phase not in phase_keys:
            raise ValueError(f'Unknown checkpoint phase: {phase}')
        for key in phase_keys[phase]:
            manifest.pop(key, None)

    def _record_usage(self, manifest, stage, stage_usage):
        event = {
            'timestamp_utc': _now(),
            'github_run_id': os.getenv('GITHUB_RUN_ID', ''),
            'stage': stage,
            **stage_usage,
        }
        manifest.setdefault('usage_history', []).append(event)
        manifest.setdefault('latest_stage_usage', {})[stage] = stage_usage
        manifest['cumulative_cost_usd'] = round(
            float(manifest.get('cumulative_cost_usd', 0) or 0) + stage_usage['cost'],
            6,
        )
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
            'stage1_model': self.s.stage1_model,
            'stage1_reasoning_effort': self.s.stage1_reasoning_effort,
        }

    def _checkpoint_key_stage2(self, stage1_key, prompt2, summary, stage1_handoff):
        return {
            **stage1_key,
            'prompt2_hash': _hash(prompt2),
            'summary_hash': _hash(summary),
            'stage1_handoff_hash': _hash(stage1_handoff),
            'stage2_model': self.s.stage2_model,
            'stage2_reasoning_effort': self.s.stage2_reasoning_effort,
        }

    def _checkpoint_key_stage3(
        self,
        stage2_key,
        prompt3,
        master_evidence,
        source_paths,
        app,
        stage2_handoff,
    ):
        return {
            'checkpoint_schema_version': _CHECKPOINT_SCHEMA_VERSION,
            'stage2_key_hash': _hash(json.dumps(stage2_key, sort_keys=True)),
            'prompt3_hash': _hash(prompt3),
            'master_evidence_hash': _hash(master_evidence),
            'stage2_handoff_hash_for_stage3': _hash(stage2_handoff),
            'stage3_source_hashes': _source_hashes(source_paths),
            'stage3_model': self.s.stage3_model,
            'stage3_reasoning_effort': self.s.stage3_reasoning_effort,
            'make_cl': bool(app.make_cl),
            'web_search': bool(app.web_search),
            'company': app.company,
            'designation': app.designation,
            'location': app.location,
            'application_link': app.application_link,
        }

    @staticmethod
    def _matches(manifest, key):
        return all(manifest.get(k) == v for k, v in key.items())

    def _restore_stage3(self, manifest, stage3_key, folder, work):
        if manifest.get('stage3_key') != stage3_key or manifest.get('stage3_complete') is not True:
            return None
        artifact_names = manifest.get('stage3_artifacts') or []
        if not artifact_names:
            return None
        stage3_path = work / 'stage3.md'
        if not self.drive.download_if_exists('stage3.md', folder, stage3_path):
            return None
        checkpoint_folder = self._checkpoint_folder(folder, 'Stage3_Generated')
        restored_dir = work / 'generated_checkpoint'
        restored_dir.mkdir(parents=True, exist_ok=True)
        artifacts = []
        for raw_name in artifact_names:
            name = Path(str(raw_name)).name
            if name != raw_name:
                return None
            path = restored_dir / name
            if not self.drive.download_if_exists(name, checkpoint_folder, path):
                return None
            artifacts.append(path)
        return stage3_path.read_text(encoding='utf-8'), artifacts

    def _checkpoint_stage3_artifacts(self, artifacts, folder):
        paths = [Path(path) for path in artifacts if Path(path).is_file()]
        if not any(path.suffix.lower() == '.docx' for path in paths):
            raise QAError('Stage 3 produced no DOCX artifacts.')
        checkpoint_folder = self._checkpoint_folder(folder, 'Stage3_Generated')
        names = []
        for path in paths:
            self.drive.upload(path, checkpoint_folder)
            names.append(path.name)
        return names

    def run(self, app):
        print(
            f'[workflow] Starting {app.candidate_key} application: {app.company} - {app.designation}',
            flush=True,
        )
        if not self.sheet.prepare(app):
            return

        errors = app.validate()
        profile = self.profiles[app.candidate_key]
        missing = profile.missing_required()
        if missing:
            errors.append(
                f'{app.candidate_name} profile is missing required configuration: {", ".join(missing)}.'
            )
        if errors:
            message = ' '.join(errors)
            self.sheet.fail(app, message, 'ERROR_CONFIG')
            raise RuntimeError(message)

        self.sheet.claim(app)
        work = Path(self.s.workdir) / app.application_id
        work.mkdir(parents=True, exist_ok=True)
        current_stage = 'INITIALISING'
        folder = None
        manifest = None
        manifest_path = None

        try:
            folder, _ = self._folders(app)
            prompt1 = self.prompts.read(app.candidate_key, '#Prompt1.md', work)
            prompt2 = self.prompts.read(app.candidate_key, '#Prompt2.md', work)
            prompt3 = self.prompts.read(app.candidate_key, '#Prompt3.md', work)
            manifest, manifest_path = self._manifest(folder, work)
            manifest['schema_version'] = _CHECKPOINT_SCHEMA_VERSION
            manifest.setdefault('candidate', app.candidate_key)
            manifest.setdefault('application_id', app.application_id)
            manifest.setdefault('cumulative_cost_usd', 0.0)

            # Stage 1
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
                stage1_handoff = _extract_handoff(stage1, 'STAGE1_HANDOFF')
                print('[workflow] Reusing verified Stage 1 checkpoint', flush=True)
            else:
                self._invalidate_from(manifest, 'stage1')
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
                        model=self.s.stage1_model,
                        cache_prefix='',
                        cache_key=f'{app.candidate_key}:stage1',
                    ),
                    'Stage 1 AI call',
                )
                stage1_handoff = _extract_handoff(stage1, 'STAGE1_HANDOFF')
                stage1_path.write_text(stage1, encoding='utf-8')
                self.drive.upload(stage1_path, folder)
                manifest['stage1_complete'] = True
                self._record_usage(manifest, 'stage1', _usage(response1, self.s.stage1_model))
                self._save_manifest(manifest, manifest_path, folder)
            self._guard(manifest)

            # Stage 2
            current_stage = 'STAGE_2'
            self.sheet.update(app, {'workflow': current_stage})
            summary, summary_path = self.sources.stage2(app.candidate_key, work)
            stage2_key = self._checkpoint_key_stage2(stage1_key, prompt2, summary, stage1_handoff)
            stage2_path = work / 'stage2.md'
            stage2_valid = (
                manifest.get('stage2_key') == stage2_key
                and manifest.get('stage2_complete') is True
                and self.drive.download_if_exists('stage2.md', folder, stage2_path)
            )
            if stage2_valid:
                stage2 = stage2_path.read_text(encoding='utf-8')
                stage2_handoff = _extract_handoff(stage2, 'STAGE2_HANDOFF')
                print('[workflow] Reusing verified Stage 2 checkpoint', flush=True)
            else:
                self._invalidate_from(manifest, 'stage2')
                input2 = (
                    f'Company: {app.company}\nDesignation: {app.designation}\nLink: {app.application_link}'
                    f'\n\nRAW JOB DESCRIPTION\n{app.raw_jd}'
                    f'\n\n{stage1_handoff}'
                )
                stage2, response2 = self.retry(
                    lambda: self.ai.text(
                        prompt2,
                        input2,
                        self.s.stage2_reasoning_effort,
                        self.s.stage2_max_output_tokens,
                        model=self.s.stage2_model,
                        cache_prefix=f'COMPACT SUMMARY DOC / EVIDENCE ROUTER\n{summary}',
                        cache_key=f'{app.candidate_key}:stage2',
                    ),
                    'Stage 2 AI call',
                )
                stage2_handoff = _extract_handoff(stage2, 'STAGE2_HANDOFF')
                stage2_path.write_text(stage2, encoding='utf-8')
                self.drive.upload(stage2_path, folder)
                manifest['stage2_key'] = stage2_key
                manifest['stage2_complete'] = True
                self._record_usage(manifest, 'stage2', _usage(response2, self.s.stage2_model))
                self._save_manifest(manifest, manifest_path, folder)
            self._guard(manifest)

            # Stage 3 generation
            current_stage = 'STAGE_3'
            self.sheet.update(app, {'workflow': current_stage})
            master_evidence, master_path = self.sources.master_evidence(app.candidate_key, work)
            source_paths = self.sources.stage3(
                app.candidate_key,
                work,
                summary_path,
                master_path,
                stage2_handoff,
                make_cover_letter=app.make_cl,
            )
            stage3_sources = source_telemetry(source_paths)
            stage3_key = self._checkpoint_key_stage3(
                stage2_key,
                prompt3,
                master_evidence,
                source_paths,
                app,
                stage2_handoff,
            )
            restored_stage3 = self._restore_stage3(manifest, stage3_key, folder, work)
            if restored_stage3:
                stage3, artifacts = restored_stage3
                manifest['stage3_sources'] = stage3_sources
                print('[workflow] Reusing verified Stage 3 generation checkpoint', flush=True)
            else:
                self._invalidate_from(manifest, 'stage3')
                controls = (
                    f'MAKE_CV = TRUE\n'
                    f'MAKE_COVER_LETTER = {str(app.make_cl).upper()}\n'
                    f'WEB_SEARCH = {str(app.web_search).upper()}'
                )
                input3 = (
                    f'{controls}\n\n'
                    f'Company: {app.company}\nRole: {app.designation}\nLocation: {app.location}\n'
                    f'Link: {app.application_link}\n\nRAW JOB DESCRIPTION\n{app.raw_jd}\n\n'
                    f'{stage2_handoff}\n\n'
                    'Use Selected_Evidence.md as the detailed candidate-evidence package. '
                    'Do not search for or reconstruct the full Summary Doc or Master Evidence Bank. '
                    'Use the supplied Formatting Master, Base CV and the single selected structure reference. '
                    'If MAKE_COVER_LETTER=TRUE, also use the supplied CV & Cover letter rules/template. '
                    'Create the requested Word artifact(s). Keep the textual completion report compact: '
                    'include the ATS Match Score, a short category breakdown, strongest matched keywords, '
                    'material missing/unsupported keywords, top recruiter strengths/concerns, and any material '
                    'evidence deviation or unresolved factual gap; do not repeat the full Stage 1/2 analysis.'
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
                        model=self.s.stage3_model,
                    ),
                    'Stage 3 AI/artifact call',
                )
                stage3_path = work / 'stage3.md'
                stage3_path.write_text(stage3, encoding='utf-8')
                self.drive.upload(stage3_path, folder)
                artifact_names = self._checkpoint_stage3_artifacts(artifacts, folder)
                manifest['stage3_key'] = stage3_key
                manifest['stage3_complete'] = True
                manifest['stage3_artifacts'] = artifact_names
                manifest['stage3_started'] = True
                manifest['stage3_sources'] = stage3_sources
                manifest['stage3_effective_prompt_hash'] = _hash(prompt3 + '\n\n' + input3)
                manifest['prompt3_hash'] = _hash(prompt3)
                manifest['master_evidence_hash'] = _hash(master_evidence)
                manifest['stage3_model'] = self.s.stage3_model
                manifest['stage3_reasoning_effort'] = self.s.stage3_reasoning_effort
                stage3_usage = _usage(response3, self.s.stage3_model)
                stage3_usage['sources'] = stage3_sources
                stage3_usage['source_count'] = len(stage3_sources)
                stage3_usage['source_bytes_total'] = sum(x['bytes'] for x in stage3_sources)
                self._record_usage(manifest, 'stage3', stage3_usage)
                self._save_manifest(manifest, manifest_path, folder)
            self._guard(manifest)

            # Normalize
            current_stage = 'NORMALIZE'
            self.sheet.update(app, {'workflow': current_stage})
            final = work / 'final'
            final.mkdir(parents=True, exist_ok=True)
            company = _safe(app.company)
            role = _safe(app.designation)
            cv_name = f'{app.filename_name}_{company}_{role}_CV.docx'
            cl_name = f'{app.filename_name}_{company}_{role}_Cover_Letter.docx' if app.make_cl else None
            normalize_key = {
                'checkpoint_schema_version': _CHECKPOINT_SCHEMA_VERSION,
                'stage3_key_hash': _hash(json.dumps(stage3_key, sort_keys=True)),
                'cv_name': cv_name,
                'cl_name': cl_name or '',
            }
            normalized_folder = self._checkpoint_folder(folder, 'Normalized')
            cv = final / cv_name
            cover_letter = final / cl_name if cl_name else None
            normalize_valid = (
                manifest.get('normalize_key') == normalize_key
                and manifest.get('normalize_complete') is True
                and self.drive.download_if_exists(cv_name, normalized_folder, cv)
            )
            if normalize_valid and cover_letter:
                normalize_valid = bool(self.drive.download_if_exists(cl_name, normalized_folder, cover_letter))
            if normalize_valid:
                print('[workflow] Reusing verified normalization checkpoint', flush=True)
            else:
                self._invalidate_from(manifest, 'normalize')
                try:
                    cv, cover_letter = normalize(artifacts, cv_name, cl_name, final)
                except QAError:
                    self._invalidate_from(manifest, 'stage3')
                    self._save_manifest(manifest, manifest_path, folder)
                    raise
                self.drive.upload(cv, normalized_folder)
                if cover_letter:
                    self.drive.upload(cover_letter, normalized_folder)
                manifest['normalize_key'] = normalize_key
                manifest['normalize_complete'] = True
                manifest['normalized_cv_name'] = cv.name
                manifest['normalized_cl_name'] = cover_letter.name if cover_letter else ''
                self._save_manifest(manifest, manifest_path, folder)

            # QA
            current_stage = 'QA'
            self.sheet.update(app, {'workflow': current_stage})
            qa_key = {
                'checkpoint_schema_version': _CHECKPOINT_SCHEMA_VERSION,
                'normalize_key_hash': _hash(json.dumps(normalize_key, sort_keys=True)),
                'cv_hash': _file_hash(cv),
                'cl_hash': _file_hash(cover_letter) if cover_letter else '',
                'master_evidence_hash': _hash(master_evidence),
            }
            qa_report_path = work / 'Factual_QA.md'
            qa_valid = (
                manifest.get('qa_key') == qa_key
                and manifest.get('qa_complete') is True
                and self.drive.download_if_exists('Factual_QA.md', folder, qa_report_path)
            )
            if qa_valid:
                print('[workflow] Reusing verified QA checkpoint', flush=True)
            else:
                self._invalidate_from(manifest, 'qa')
                try:
                    one_page(cv, work / 'rendered')
                    if cover_letter:
                        one_page(cover_letter, work / 'rendered')
                    qa_report = factual_report(cv, master_evidence, qa_report_path)
                    if qa_report['critical']:
                        raise QAError(
                            'Factual QA found unsupported high-risk claims: '
                            + '; '.join(qa_report['critical'][:8])
                        )
                except QAError as error:
                    if _qa_requires_regeneration(error) or str(error).startswith('Factual QA found'):
                        self._invalidate_from(manifest, 'stage3')
                    else:
                        self._invalidate_from(manifest, 'qa')
                    self._save_manifest(manifest, manifest_path, folder)
                    raise
                self.drive.upload(qa_report_path, folder)
                manifest['qa_key'] = qa_key
                manifest['qa_complete'] = True
                self._save_manifest(manifest, manifest_path, folder)

            # Final CV/CL uploads
            current_stage = 'DRIVE_UPLOAD'
            self.sheet.update(app, {'workflow': current_stage})
            drive_upload_key = {
                'checkpoint_schema_version': _CHECKPOINT_SCHEMA_VERSION,
                'qa_key_hash': _hash(json.dumps(qa_key, sort_keys=True)),
                'cv_hash': _file_hash(cv),
                'cl_hash': _file_hash(cover_letter) if cover_letter else '',
            }
            cv_item = self.drive.find(cv.name, [folder])
            cl_item = self.drive.find(cover_letter.name, [folder]) if cover_letter else None
            drive_upload_valid = (
                manifest.get('drive_upload_key') == drive_upload_key
                and manifest.get('drive_upload_complete') is True
                and cv_item is not None
                and (cover_letter is None or cl_item is not None)
            )
            if drive_upload_valid:
                cv_link = cv_item.get('webViewLink', '') or manifest.get('cv_link', '')
                cl_link = (
                    (cl_item.get('webViewLink', '') or manifest.get('cl_link', ''))
                    if cover_letter
                    else ''
                )
                if not cv_link or (cover_letter and not cl_link):
                    drive_upload_valid = False
            if drive_upload_valid:
                print('[workflow] Reusing verified Drive-upload checkpoint', flush=True)
            else:
                self._invalidate_from(manifest, 'drive_upload')
                _, cv_link = self.drive.upload(cv, folder)
                cl_link = ''
                if cover_letter:
                    _, cl_link = self.drive.upload(cover_letter, folder)
                manifest['drive_upload_key'] = drive_upload_key
                manifest['drive_upload_complete'] = True
                manifest['cv_link'] = cv_link
                manifest['cl_link'] = cl_link
                self._save_manifest(manifest, manifest_path, folder)

            # Final audit files + Sheet update
            current_stage = 'FINALIZE'
            self.sheet.update(app, {'workflow': current_stage})
            current_cost = float(manifest.get('cumulative_cost_usd', 0) or 0)
            usage_path = work / 'Token_Usage.json'
            usage_path.write_text(
                json.dumps(
                    {
                        'candidate': app.candidate_key,
                        'application_id': app.application_id,
                        'cumulative_cost_usd': current_cost,
                        'cost_basis': {
                            'model_cost': 'Estimated from response token usage and configured model prices.',
                            'web_search_usd_per_search_action': _TOOL_PRICES_USD['web_search_call'],
                            'code_interpreter_1gb_session_usd': _TOOL_PRICES_USD['code_interpreter_1gb_session'],
                            'note': (
                                'Built-in tool charges are estimated from tool activity visible in the response. '
                                'Provider billing remains authoritative.'
                            ),
                        },
                        'stage3_sources': manifest.get('stage3_sources', []),
                        'latest_stage_usage': manifest.get('latest_stage_usage', {}),
                        'usage_history': manifest.get('usage_history', []),
                    },
                    indent=2,
                ),
                encoding='utf-8',
            )
            self.drive.upload(usage_path, folder)

            context = write_context(
                work / 'Application_Context.md',
                app,
                stage1,
                stage2,
                stage3,
                cv,
                cv_link,
            )
            _, context_link = self.drive.upload(context, folder)

            manifest.update(
                {
                    'candidate': app.candidate_key,
                    'application_id': app.application_id,
                    'jd_hash': app.jd_hash,
                    'prompt1_hash': _hash(prompt1),
                    'prompt2_hash': _hash(prompt2),
                    'prompt3_hash': _hash(prompt3),
                    'summary_hash': _hash(summary),
                    'master_evidence_hash': _hash(master_evidence),
                    'stage1_model': self.s.stage1_model,
                    'stage2_model': self.s.stage2_model,
                    'stage3_model': self.s.stage3_model,
                    'stage1_complete': True,
                    'stage2_complete': True,
                    'stage3_complete': True,
                    'normalize_complete': True,
                    'qa_complete': True,
                    'drive_upload_complete': True,
                    'complete': True,
                    'completed_at_utc': _now(),
                    'cv_link': cv_link,
                    'cl_link': cl_link,
                    'context_link': context_link,
                }
            )
            self._save_manifest(manifest, manifest_path, folder)
            self.sheet.done(app, cv_link, cl_link, context_link, current_cost)
            print(
                f'[workflow] COMPLETE: {app.application_id}; cumulative cost=${current_cost:.4f}',
                flush=True,
            )

        except CostLimitError as error:
            self.sheet.fail(app, f'{current_stage}: {error}', 'ERROR_MANUAL')
            raise
        except QAError as error:
            self.sheet.fail(app, f'{current_stage}: {error}', 'ERROR_MANUAL')
            raise
        except Exception as error:
            self.sheet.fail(app, f'{current_stage}: {type(error).__name__}: {error}')
            raise
