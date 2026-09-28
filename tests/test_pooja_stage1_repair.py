from types import SimpleNamespace

import pytest

from automate_cv.openai_client import AI


class FakeResponses:
    def __init__(self, outputs):
        self.outputs = iter(outputs)
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(output_text=next(self.outputs), model='gpt-5.6-terra',
                               usage=None, output=[])


def fake_ai(outputs):
    ai = AI.__new__(AI)
    ai.settings = SimpleNamespace(openai_model='gpt-5.6-terra',
                                  openai_reasoning_effort='low')
    ai.cache_candidates = set()
    ai.client = SimpleNamespace(responses=FakeResponses(outputs))
    return ai


def test_pooja_repairs_missing_stage1_handoff_without_repeating_analysis():
    ai = fake_ai(['JD analysis: stakeholder experience required.',
                  'STAGE1_HANDOFF\nrole_family: consulting\nseniority: senior consultant'])
    text, response = ai.text('# Pooja automation handoff', 'JD', model='gpt-5.6-terra')
    assert len(ai.client.responses.calls) == 2
    assert 'COMPLETED STAGE 1 DRAFT' in ai.client.responses.calls[1]['input']
    assert 'JD analysis:' in text and 'STAGE1_HANDOFF' in text
    assert response.output_text == text


def test_abhishek_stage1_does_not_use_pooja_repair():
    ai = fake_ai(['JD analysis without handoff'])
    text, _ = ai.text('Abhishek JD prompt', 'JD', model='gpt-5.6-terra')
    assert text == 'JD analysis without handoff'
    assert len(ai.client.responses.calls) == 1


def test_pooja_rejects_empty_stage1_draft():
    ai = fake_ai([''])
    with pytest.raises(RuntimeError, match='no JD analysis'):
        ai.text('# Pooja automation handoff', 'JD', model='gpt-5.6-terra')
