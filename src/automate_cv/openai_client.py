import json
import re
import time
from pathlib import Path
from types import SimpleNamespace

import httpx
from openai import OpenAI


_STAGE2_HANDOFF_REPAIR_INSTRUCTIONS = '''
You are repairing the machine-readable handoff from an already-completed Stage 2 CV evidence-selection draft.

Return ONLY one compact machine-readable handoff. Do not repeat the analysis and do not add facts, evidence, metrics, ownership, qualifications, skills or conclusions that are not supported by the supplied Stage 2 draft.

The first line MUST be exactly:
STAGE2_HANDOFF

Then provide YAML using this schema. Use [] or an empty value when the draft does not support a field; never invent missing information.

company:
role_title:
location:
team_or_function:
seniority:
role_family:
cv_structure:
cv_evidence_strategy:
critical_requirements:
  - id:
    need:
    selected_evidence_keys: []
strongly_preferred_requirements:
  - id:
    need:
    selected_evidence_keys: []
selected_professional_evidence:
  - key:
    requirements: []
    factual_anchor:
    supported_metrics: []
selected_projects:
  - id:
    classification:
    ownership_boundary:
    requirements: []
selected_achievements_qualifications_skills: []
ats_priority_terms: []
definitely_include: []
include_if_space: []
exclude_or_interview_only: []
gaps: []
do_not_claim: []
stage3_evidence_to_retrieve_or_verify: []

Preserve the Stage 2 draft's own evidence IDs where present. Do not substitute new IDs. Do not write prose before or after the handoff.
'''.strip()


class AI:
    def __init__(self, settings):
        if not settings.openai_api_key:
            raise RuntimeError('OPENAI_API_KEY is not configured.')
        self.client = OpenAI(api_key=settings.openai_api_key)
        self.settings = settings
        # The hourly runner fills this only for candidates with 2+ applications in
        # the same run. GPT-5.6 guarantees a 30-minute cache lifetime, so a single
        # application in an hourly batch should not pay a cache-write premium that
        # is unlikely to be reused before the next scheduled run.
        self.cache_candidates = set()
        self.http = httpx.Client(
            base_url='https://api.openai.com/v1',
            headers={'Authorization': f'Bearer {settings.openai_api_key}'},
            timeout=180,
        )

    def _cache_allowed(self, cache_key):
        if not cache_key:
            return False
        candidate = str(cache_key).split(':', 1)[0]
        return candidate in self.cache_candidates

    @staticmethod
    def _usage_value(response, name):
        usage = getattr(response, 'usage', None)
        return int(getattr(usage, name, 0) or 0) if usage else 0

    @staticmethod
    def _usage_detail(response, group, name):
        usage = getattr(response, 'usage', None)
        details = getattr(usage, group, None) if usage else None
        return int(getattr(details, name, 0) or 0) if details else 0

    def _combined_text_response(self, responses, output_text):
        """Return one response-like object whose usage includes every paid call."""
        if len(responses) == 1:
            return responses[0]
        usage = SimpleNamespace(
            input_tokens=sum(self._usage_value(r, 'input_tokens') for r in responses),
            output_tokens=sum(self._usage_value(r, 'output_tokens') for r in responses),
            input_tokens_details=SimpleNamespace(
                cached_tokens=sum(
                    self._usage_detail(r, 'input_tokens_details', 'cached_tokens')
                    for r in responses
                ),
                cache_write_tokens=sum(
                    self._usage_detail(r, 'input_tokens_details', 'cache_write_tokens')
                    for r in responses
                ),
            ),
            output_tokens_details=SimpleNamespace(
                reasoning_tokens=sum(
                    self._usage_detail(r, 'output_tokens_details', 'reasoning_tokens')
                    for r in responses
                )
            ),
        )
        return SimpleNamespace(
            model=getattr(responses[-1], 'model', ''),
            usage=usage,
            output=[],
            output_text=output_text,
            component_responses=list(responses),
        )

    def _repair_stage2_handoff(self, selected_model, draft_text):
        print(
            '[openai] Stage 2 output omitted or malformed STAGE2_HANDOFF; '
            'running compact handoff repair only.',
            flush=True,
        )
        return self.client.responses.create(
            model=selected_model,
            instructions=_STAGE2_HANDOFF_REPAIR_INSTRUCTIONS,
            input=f'STAGE 2 DRAFT TO REPAIR\n\n{draft_text}',
            reasoning={'effort': 'low'},
            max_output_tokens=3500,
        )

    @staticmethod
    def _has_stage2_handoff(text):
        text = str(text or '')
        # Match the same broad forms accepted by workflow._extract_handoff:
        # a standalone marker/heading, optionally inside a fenced YAML/JSON block.
        if __import__('re').search(
            r'(?im)^\s*(?:#+\s*)?(?:\d+\.\s*)?STAGE2_HANDOFF\s*:?\s*$',
            text,
        ):
            return True
        return bool(__import__('re').search(
            r'(?is)```(?:ya?ml|json)?\s*\n\s*STAGE2_HANDOFF\s*:?\s*\n',
            text,
        ))

    @staticmethod
    def _stage2_handoff_truncated(text):
        """Detect a YAML handoff cut off while composing Stage 2."""
        raw = str(text or '')
        markers = list(re.finditer(
            r'(?im)^\s*(?:#+\s*)?(?:\d+\.\s*)?STAGE2_HANDOFF\s*:?\s*$',
            raw,
        ))
        if not markers:
            return False
        tail = raw[markers[-1].end():]
        if tail.count(chr(96) * 3) % 2:
            return True
        return 'critical_requirements:' in tail and (
            'selected_professional_evidence:' not in tail
            and 'selected_projects:' not in tail
        )

    @staticmethod
    def _replace_partial_stage2_handoff(text, repaired):
        """Keep the analysis audit, replacing only the incomplete handoff."""
        raw = str(text or '')
        markers = list(re.finditer(
            r'(?im)^\s*(?:#+\s*)?(?:\d+\.\s*)?STAGE2_HANDOFF\s*:?\s*$',
            raw,
        ))
        analysis = raw[:markers[-1].start()].rstrip() if markers else raw.rstrip()
        return analysis + '\n\n' + str(repaired).strip()

    @staticmethod
    def _usable_stage2_handoff(text):
        from .sources import selected_evidence_ids, selected_cv_structure
        if not AI._has_stage2_handoff(text) or AI._stage2_handoff_truncated(text):
            return False
        try:
            return bool(selected_evidence_ids(text)) and bool(selected_cv_structure(text))
        except (ValueError, RuntimeError):
            return False

    def repair_stage2_handoff(self, draft, model):
        """A compact, separately metered repair, not a full analysis rerun."""
        response = self._repair_stage2_handoff(model, draft)
        repaired = str(response.output_text or '').strip()
        if not self._usable_stage2_handoff(repaired):
            raise RuntimeError(
                'Stage 2 handoff repair has no supported selected evidence IDs or '
                'CV structure; refusing to proceed with unsupported facts.'
            )
        return repaired, response

    def text(
        self,
        prompt,
        user_input,
        reasoning_effort=None,
        max_output_tokens=None,
        model=None,
        cache_prefix=None,
        cache_key=None,
    ):
        selected_model = model or self.settings.openai_model
        kwargs = {
            'model': selected_model,
            'reasoning': {
                'effort': reasoning_effort or self.settings.openai_reasoning_effort,
            },
        }

        # cache_prefix is content, not merely a cache optimization. Always include it
        # in the request. For singleton/hourly calls we skip only the explicit cache
        # breakpoint/write, never the router/context itself.
        stable = prompt
        if cache_prefix:
            stable = f'{prompt}\n\n{cache_prefix}'

        if cache_prefix is not None and self._cache_allowed(cache_key):
            kwargs['input'] = [
                {
                    'role': 'developer',
                    'content': [
                        {
                            'type': 'input_text',
                            'text': stable,
                            'prompt_cache_breakpoint': {'mode': 'explicit'},
                        }
                    ],
                },
                {
                    'role': 'user',
                    'content': [
                        {
                            'type': 'input_text',
                            'text': user_input,
                        }
                    ],
                },
            ]
            kwargs['prompt_cache_options'] = {
                'mode': self.settings.prompt_cache_mode,
                'ttl': self.settings.prompt_cache_ttl,
            }
            kwargs['prompt_cache_key'] = cache_key
        else:
            # No cache write for a candidate with only one application in this
            # hourly batch. The stable content is still supplied; only the explicit
            # cache-write controls are omitted.
            kwargs['instructions'] = stable
            kwargs['input'] = user_input

        if max_output_tokens:
            kwargs['max_output_tokens'] = max_output_tokens
        response = self.client.responses.create(**kwargs)
        output_text = response.output_text
        responses = [response]

        # Stage 2's prose analysis can occasionally consume the visible response
        # before the mandatory machine handoff is emitted. Do not rerun the full
        # expensive Stage 2 analysis in that case. A small Terra/low formatting
        # repair converts only the already-produced draft into the required handoff.
        if 'STAGE2_HANDOFF' in str(prompt) and (
            not self._has_stage2_handoff(output_text)
            or self._stage2_handoff_truncated(output_text)
        ):
            repaired_text, repair = self.repair_stage2_handoff(
                output_text, selected_model
            )
            responses.append(repair)
            output_text = self._replace_partial_stage2_handoff(
                output_text, repaired_text
            )

        return output_text, self._combined_text_response(responses, output_text)

    def upload(self, path):
        with Path(path).open('rb') as fh:
            return self.client.files.create(file=fh, purpose='user_data').id

    def _dict(self, obj):
        return obj.model_dump() if hasattr(obj, 'model_dump') else json.loads(obj.json())

    @staticmethod
    def _missing_container_artifact(error):
        """Only absent/expired OpenAI container artifacts may be regenerated."""
        return (
            isinstance(error, httpx.HTTPStatusError)
            and error.response.status_code in (404, 410)
        )

    def _generated_files(self, response):
        """Recover Word files from citations OR the Code Interpreter container.

        The model can print a sandbox link without attaching a file citation.
        Listing only assistant-created DOCX files avoids reusing the uploaded
        base CV, templates or other user-supplied documents as generated output.
        """
        found = []
        containers = set()

        def walk(x):
            if isinstance(x, dict):
                if (
                    x.get('type') == 'container_file_citation'
                    and x.get('container_id')
                    and x.get('file_id')
                ):
                    containers.add(x['container_id'])
                    found.append((
                        x['container_id'],
                        x['file_id'],
                        x.get('filename') or f"{x['file_id']}.bin",
                    ))
                if x.get('type') == 'code_interpreter_call' and x.get('container_id'):
                    containers.add(x['container_id'])
                for value in x.values():
                    walk(value)
            elif isinstance(x, list):
                for value in x:
                    walk(value)

        walk(self._dict(response))
        for container_id in sorted(containers):
            after = None
            try:
                while True:
                    params = {'limit': 100}
                    if after:
                        params['after'] = after
                    listing = self.http.get(
                        f'/containers/{container_id}/files', params=params,
                    )
                    listing.raise_for_status()
                    page = listing.json()
                    entries = page.get('data') or []
                    for entry in entries:
                        path = entry.get('path') or ''
                        if (
                            entry.get('source') == 'assistant'
                            and entry.get('id')
                            and Path(path).suffix.lower() == '.docx'
                        ):
                            found.append((container_id, entry['id'], Path(path).name))
                    if not page.get('has_more') or not entries:
                        break
                    after = entries[-1].get('id')
                    if not after:
                        break
            except Exception as error:
                # Expired containers are recoverable: the Stage 3 caller can
                # request a fresh Word artifact. Other errors still propagate
                # unless we already have a DOCX citation to try.
                if (
                    not self._missing_container_artifact(error)
                    and not any(Path(name).suffix.lower() == '.docx'
                                for _, _, name in found)
                ):
                    raise
                print(
                    f'[openai] WARNING: container file listing unavailable: '
                    f'{type(error).__name__}: {error}',
                    flush=True,
                )
        # Deduplicate citations/listings but retain the real DOCX name when
        # a citation supplies only a generic file ID or .bin placeholder.
        unique = {}
        for container_id, file_id, name in found:
            key = (container_id, file_id)
            prior = unique.get(key)
            if prior is None or (
                Path(prior[2]).suffix.lower() != '.docx'
                and Path(name).suffix.lower() == '.docx'
            ):
                unique[key] = (container_id, file_id, name)
        return list(unique.values())

    def _download_generated_files(self, response, output_dir):
        """Download only generated DOCX files; ignore expired file references.

        OpenAI sometimes cites a container file that immediately returns
        HTTP 404/410. Retry the file fetch once before discarding that
        reference. If no DOCX survives, stage3's existing artifact retry
        requests a *new* document rather than failing the entire workflow.
        Never swallow permission, rate-limit or server errors.
        """
        artifacts = []
        for container_id, file_id, filename in self._generated_files(response):
            if Path(filename).suffix.lower() != '.docx':
                continue
            url = f'/containers/{container_id}/files/{file_id}/content'
            result = None
            for attempt in range(2):
                try:
                    candidate = self.http.get(url)
                    candidate.raise_for_status()
                    result = candidate
                    break
                except httpx.HTTPStatusError as error:
                    if not self._missing_container_artifact(error):
                        raise
                    if attempt == 0:
                        # A freshly created file may not yet be retrievable.
                        time.sleep(1)
                    else:
                        print(
                            f'[openai] WARNING: missing generated DOCX '
                            f'{filename} (HTTP {error.response.status_code}); '
                            f'attempting remaining files or regeneration.',
                            flush=True,
                        )
            if result is None:
                continue
            target = output_dir / Path(filename).name
            target.write_bytes(result.content)
            artifacts.append(target)
        return artifacts

    def stage3(
        self,
        prompt,
        user_input,
        paths,
        output_dir,
        web_search=False,
        reasoning_effort=None,
        max_output_tokens=None,
        model=None,
        fallback_model=None,
    ):
        ids = [self.upload(path) for path in paths]
        tools = [
            {
                'type': 'code_interpreter',
                'container': {'type': 'auto', 'file_ids': ids},
            }
        ]
        if web_search:
            tools.append({'type': 'web_search'})
        try:
            kwargs = {
                'model': model or self.settings.openai_model,
                'instructions': prompt,
                'input': user_input,
                'reasoning': {
                    'effort': reasoning_effort or self.settings.openai_reasoning_effort,
                },
                'tools': tools,
            }
            if max_output_tokens:
                kwargs['max_output_tokens'] = max_output_tokens
            output_dir = Path(output_dir)
            output_dir.mkdir(parents=True, exist_ok=True)
            responses = []
            for attempt in range(2):
                if attempt:
                    # Retry only a missing Word artifact. Preserve the exact
                    # JD, evidence and formatting instructions on both calls.
                    kwargs['input'] = (
                        user_input + '\n\nARTIFACT RETRY: The previous response returned '
                        'no retrievable DOCX. Actually create the requested Word '
                        'document(s) with Code Interpreter, save them in /mnt/data, '
                        'and cite the real files. Do not claim success from a '
                        'text-only sandbox link. Do not change candidate facts.'
                    )
                response = self.client.responses.create(**kwargs)
                responses.append(response)
                artifacts = self._download_generated_files(response, output_dir)
                if any(path.suffix.lower() == '.docx' for path in artifacts):
                    break
                if attempt == 0:
                    print(
                        '[openai] Stage 3 returned no retrievable DOCX; '
                        'retrying document generation once.',
                        flush=True,
                    )
            # Economy-only safety net: one Sol attempt AFTER Luna's existing
            # two attempts fail to produce a retrievable Word document.
            # Preserve all instructions, evidence, candidate data and usage.
            # Never invoke this branch for Balanced or Premium.
            if (fallback_model
                and not any(path.suffix.lower() == '.docx' for path in artifacts)):
                print(
                    f'[openai] Economy Stage 3 has no DOCX after two attempts; '
                    f'trying one {fallback_model} fallback.',
                    flush=True,
                )
                kwargs['model'] = fallback_model
                kwargs['input'] = (
                    user_input + '\\n\\nECONOMY DOCUMENT FALLBACK: Generate the '
                    'requested actual Word document using Code Interpreter. '
                    'Save the Word file to /mnt/data and provide its real '
                    'file reference. Preserve the exact JD, verified evidence, '
                    'formatting rules and candidate identity.'
                )
                response = self.client.responses.create(**kwargs)
                responses.append(response)
                artifacts = self._download_generated_files(response, output_dir)
            combined = self._combined_text_response(responses, response.output_text)
            if len(responses) > 1:
                # Keep all tool calls in cost telemetry, including the first
                # paid attempt that produced no Word document.
                combined.output = [
                    item for one in responses for item in (getattr(one, 'output', None) or [])
                ]
            return response.output_text, combined, artifacts
        finally:
            for file_id in ids:
                try:
                    self.client.files.delete(file_id)
                except Exception:
                    pass
