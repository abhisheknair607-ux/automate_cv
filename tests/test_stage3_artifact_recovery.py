"""Regression tests for the Stage 3 missing-DOCX production failure."""
from pathlib import Path
from types import SimpleNamespace

from automate_cv.openai_client import AI


class Response:
    def __init__(self, output, text='Stage 3 complete', input_tokens=100, output_tokens=50):
        self.output = output
        self.output_text = text
        self.model = 'gpt-5.6-sol'
        self.usage = SimpleNamespace(
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            input_tokens_details=SimpleNamespace(cached_tokens=0, cache_write_tokens=0),
            output_tokens_details=SimpleNamespace(reasoning_tokens=0),
        )

    def model_dump(self):
        return {'output': self.output}


class HTTP:
    def __init__(self, pages):
        self.pages = pages
        self.calls = []

    def get(self, path, params=None):
        self.calls.append((path, params))
        if path.endswith('/files'):
            after = (params or {}).get('after')
            page = self.pages.get(after, {'data': [], 'has_more': False})
            return SimpleNamespace(raise_for_status=lambda: None, json=lambda: page)
        return SimpleNamespace(
            raise_for_status=lambda: None,
            content=b'generated-word-file-bytes',
        )


def build_ai(responses, pages):
    ai = AI.__new__(AI)
    ai.settings = SimpleNamespace(
        openai_model='gpt-5.6-sol', openai_reasoning_effort='medium',
    )
    calls = []
    replies = iter(responses)

    def create(**kwargs):
        calls.append(kwargs)
        return next(replies)

    ai.client = SimpleNamespace(
        responses=SimpleNamespace(create=create),
        files=SimpleNamespace(delete=lambda _id: None),
    )
    ai.http = HTTP(pages)
    ai.upload = lambda _path: 'source-file-id'
    return ai, calls


def ci_output():
    return [{'type': 'code_interpreter_call', 'container_id': 'cntr_1'}]


def test_uncited_generated_docx_is_recovered_from_container(tmp_path):
    pages = {
        None: {'data': [
            {'id': 'uploaded', 'source': 'user', 'path': '/mnt/data/base_cv.docx'},
            {'id': 'generated', 'source': 'assistant', 'path': '/mnt/data/tailored_CV.docx'},
        ], 'has_more': False},
    }
    ai, calls = build_ai([Response(ci_output())], pages)
    _, _, artifacts = ai.stage3('rules', 'job', [tmp_path/'base.docx'], tmp_path/'out')
    assert len(calls) == 1
    assert [p.name for p in artifacts] == ['tailored_CV.docx']
    assert artifacts[0].read_bytes() == b'generated-word-file-bytes'
    assert not (tmp_path/'out'/'base_cv.docx').exists()


def test_container_file_listing_handles_pagination_and_excludes_user_sources():
    pages = {
        None: {'data': [{'id': 'input', 'source': 'user', 'path': '/mnt/data/cv.docx'}],
               'has_more': True},
        'input': {'data': [{'id': 'output', 'source': 'assistant',
                           'path': '/mnt/data/finished_CV.docx'}],
                  'has_more': False},
    }
    ai, _ = build_ai([], pages)
    assert ai._generated_files(Response(ci_output())) == [
        ('cntr_1', 'output', 'finished_CV.docx')
    ]
    assert any(params.get('after') == 'input' for _, params in ai.http.calls)


def test_cited_file_is_downloaded_without_duplication(tmp_path):
    citation = {'type': 'container_file_citation', 'container_id': 'cntr_1',
                'file_id': 'same-file', 'filename': 'tailored_CV.docx'}
    output = ci_output() + [{'type': 'message',
                             'content': [{'annotations': [citation]}]}]
    pages = {None: {'data': [{'id': 'same-file', 'source': 'assistant',
                              'path': '/mnt/data/tailored_CV.docx'}],
                    'has_more': False}}
    ai, calls = build_ai([Response(output)], pages)
    _, _, artifacts = ai.stage3('rules', 'job', [], tmp_path/'out')
    assert len(calls) == 1
    assert len(artifacts) == 1
    assert artifacts[0].name == 'tailored_CV.docx'


def test_missing_docx_triggers_one_retry_with_unchanged_rules_and_counted_usage(tmp_path):
    pages = {None: {'data': [{'id': 'generated', 'source': 'assistant',
                              'path': '/mnt/data/tailored_CV.docx'}],
                    'has_more': False}}
    # First response has no Code Interpreter call and no file; second does.
    ai, calls = build_ai([
        Response([], 'Text-only completion', 100, 50),
        Response(ci_output(), 'Actual Word file', 200, 60),
    ], pages)
    text, response, artifacts = ai.stage3('fixed rules', 'original JD', [], tmp_path/'out')
    assert text == 'Actual Word file'
    assert len(calls) == 2
    assert calls[0]['instructions'] == calls[1]['instructions'] == 'fixed rules'
    assert calls[1]['input'].startswith('original JD')
    assert 'Do not change candidate facts.' in calls[1]['input']
    assert response.usage.input_tokens == 300
    assert response.usage.output_tokens == 110
    assert len(response.output) == 1
    assert [p.name for p in artifacts] == ['tailored_CV.docx']


def test_two_text_only_attempts_still_fail_closed_without_using_uploaded_cv(tmp_path):
    ai, calls = build_ai([Response([]), Response([])], {})
    _, _, artifacts = ai.stage3('rules', 'job', [], tmp_path/'out')
    assert len(calls) == 2
    assert artifacts == []  # Existing QA will reject, never claim CV success.
