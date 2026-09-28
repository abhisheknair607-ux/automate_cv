import json
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

_POOJA_STAGE1_HANDOFF_REPAIR_INSTRUCTIONS = '''
Produce only the compact, machine-readable handoff from the supplied completed
Stage 1 JD analysis. Do not analyse the job again, introduce candidate evidence,
or add requirements that are absent from the draft. The first line must be
exactly STAGE1_HANDOFF, followed by YAML with role_family, seniority,
critical_requirements, strongly_preferred_requirements, ats_priority_terms,
evidence_strategy, retrieval_tags, and gaps. Use [] for unsupported lists.
Do not write prose before or after the handoff.
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
            model=getattr(responses[0], 'model', ''),
            usage=usage,
            output=[],
            output_text=output_text,
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

    def _repair_pooja_stage1_handoff(self, selected_model, draft_text):
        if not str(draft_text or '').strip():
            raise RuntimeError('Pooja Stage 1 produced no JD analysis to repair.')
        print('[openai] Pooja Stage 1 omitted STAGE1_HANDOFF; repairing the completed draft.', flush=True)
        return self.client.responses.create(
            model=selected_model,
            instructions=_POOJA_STAGE1_HANDOFF_REPAIR_INSTRUCTIONS,
            input=f'COMPLETED STAGE 1 DRAFT\n\n{draft_text}',
            reasoning={'effort': 'low'},
            max_output_tokens=1800,
        )

    @staticmethod
    def _has_handoff(text, marker):
        import re
        heading = re.search(rf'(?im)^\s*(?:#+\s*)?(?:\d+\.\s*)?{marker}\s*:?\s*$', str(text or ''))
        if not heading:
            return False
        return bool(str(text or '')[heading.end():].strip())

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

        # Pooja's long JD-analysis prompt may use its output budget before the
        # appended automation handoff. Repair only that handoff from the completed
        # draft; leave Abhishek's prompt and execution path untouched.
        if '# Pooja automation handoff' in str(prompt) and not self._has_handoff(
            output_text, 'STAGE1_HANDOFF'
        ):
            repair = self._repair_pooja_stage1_handoff(selected_model, output_text)
            responses.append(repair)
            repaired_text = str(repair.output_text or '').strip()
            if not self._has_handoff(repaired_text, 'STAGE1_HANDOFF'):
                raise RuntimeError('Pooja Stage 1 handoff repair did not produce STAGE1_HANDOFF.')
            output_text = f'{str(output_text).rstrip()}\n\n{repaired_text}'

        # Stage 2's prose analysis can occasionally consume the visible response
        # before the mandatory machine handoff is emitted. Do not rerun the full
        # expensive Stage 2 analysis in that case. A small Terra/low formatting
        # repair converts only the already-produced draft into the required handoff.
        if 'STAGE2_HANDOFF' in str(prompt) and not self._has_stage2_handoff(output_text):
            repair = self._repair_stage2_handoff(selected_model, output_text)
            responses.append(repair)
            repaired_text = str(repair.output_text or '').strip()
            if not self._has_stage2_handoff(repaired_text):
                raise RuntimeError(
                    'Stage 2 handoff repair did not produce a parseable STAGE2_HANDOFF block.'
                )
            output_text = f'{str(output_text).rstrip()}\n\n{repaired_text}'

        return output_text, self._combined_text_response(responses, output_text)

    def upload(self, path):
        with Path(path).open('rb') as fh:
            return self.client.files.create(file=fh, purpose='user_data').id

    def _dict(self, obj):
        return obj.model_dump() if hasattr(obj, 'model_dump') else json.loads(obj.json())

    def _generated_files(self, response):
        found = []

        def walk(x):
            if isinstance(x, dict):
                if (
                    x.get('type') == 'container_file_citation'
                    and x.get('container_id')
                    and x.get('file_id')
                ):
                    found.append(
                        (
                            x['container_id'],
                            x['file_id'],
                            x.get('filename') or f"{x['file_id']}.bin",
                        )
                    )
                for value in x.values():
                    walk(value)
            elif isinstance(x, list):
                for value in x:
                    walk(value)

        walk(self._dict(response))
        return list(dict.fromkeys(found))

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
            response = self.client.responses.create(**kwargs)
            output_dir = Path(output_dir)
            output_dir.mkdir(parents=True, exist_ok=True)
            artifacts = []
            for container_id, file_id, filename in self._generated_files(response):
                result = self.http.get(f'/containers/{container_id}/files/{file_id}/content')
                result.raise_for_status()
                target = output_dir / Path(filename).name
                target.write_bytes(result.content)
                artifacts.append(target)
            return response.output_text, response, artifacts
        finally:
            for file_id in ids:
                try:
                    self.client.files.delete(file_id)
                except Exception:
                    pass
