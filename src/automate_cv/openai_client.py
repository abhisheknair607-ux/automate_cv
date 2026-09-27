import json
from pathlib import Path

import httpx
from openai import OpenAI


class AI:
    def __init__(self, settings):
        if not settings.openai_api_key:
            raise RuntimeError('OPENAI_API_KEY is not configured.')
        self.client = OpenAI(api_key=settings.openai_api_key)
        self.settings = settings
        self.http = httpx.Client(
            base_url='https://api.openai.com/v1',
            headers={'Authorization': f'Bearer {settings.openai_api_key}'},
            timeout=180,
        )

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

        if cache_prefix is not None:
            # GPT-5.6 explicit caching requires the reusable prefix to live in an
            # input content block rather than top-level `instructions`.
            stable = prompt
            if cache_prefix:
                stable = f'{prompt}\n\n{cache_prefix}'
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
            if cache_key:
                # On GPT-5.6 this is optional for routing; here it is used only
                # to keep cache accounting separated by candidate/stage.
                kwargs['prompt_cache_key'] = cache_key
        else:
            kwargs['instructions'] = prompt
            kwargs['input'] = user_input

        if max_output_tokens:
            kwargs['max_output_tokens'] = max_output_tokens
        response = self.client.responses.create(**kwargs)
        return response.output_text, response

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
