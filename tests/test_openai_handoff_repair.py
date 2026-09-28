from types import SimpleNamespace

from automate_cv.openai_client import AI


class Usage:
    def __init__(self, inp, out, cached=0, written=0, reasoning=0):
        self.input_tokens = inp
        self.output_tokens = out
        self.input_tokens_details = SimpleNamespace(
            cached_tokens=cached,
            cache_write_tokens=written,
        )
        self.output_tokens_details = SimpleNamespace(reasoning_tokens=reasoning)


class Response:
    def __init__(self, text, inp, out, reasoning=0):
        self.output_text = text
        self.model = 'gpt-5.6-terra'
        self.usage = Usage(inp, out, reasoning=reasoning)
        self.output = []


class FakeResponses:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return self.responses.pop(0)


class FakeClient:
    def __init__(self, responses):
        self.responses = FakeResponses(responses)


class Settings:
    openai_model = 'gpt-5.6-sol'
    openai_reasoning_effort = 'medium'
    prompt_cache_mode = 'explicit'
    prompt_cache_ttl = '30m'


def ai_with(responses):
    ai = AI.__new__(AI)
    ai.settings = Settings()
    ai.client = FakeClient(responses)
    ai.cache_candidates = set()
    return ai


def test_stage2_missing_handoff_uses_small_repair_call_and_aggregates_usage():
    first = Response(
        'Stage 2 analysis with selected evidence PR-EY-FAR and a High Experience structure.',
        9000,
        5000,
        reasoning=700,
    )
    repair = Response(
        'STAGE2_HANDOFF\ncompany: PwC\ncv_structure: High Experience\n'
        'selected_professional_evidence:\n  - key: PR-EY-FAR\n'
        'stage3_evidence_to_retrieve_or_verify: [PR-EY-FAR]',
        1400,
        900,
        reasoning=80,
    )
    ai = ai_with([first, repair])

    text, response = ai.text(
        'Stage 2 instructions. You MUST produce STAGE2_HANDOFF.',
        'current application inputs',
        reasoning_effort='medium',
        max_output_tokens=8000,
        model='gpt-5.6-terra',
    )

    assert len(ai.client.responses.calls) == 2
    repair_call = ai.client.responses.calls[1]
    assert repair_call['model'] == 'gpt-5.6-terra'
    assert repair_call['reasoning'] == {'effort': 'low'}
    assert repair_call['max_output_tokens'] == 3500
    assert 'STAGE2_HANDOFF' in text
    assert response.usage.input_tokens == 10400
    assert response.usage.output_tokens == 5900
    assert response.usage.output_tokens_details.reasoning_tokens == 780


def test_stage2_inline_marker_mention_is_not_mistaken_for_machine_handoff():
    first = Response(
        'Stage 2 analysis complete. The STAGE2_HANDOFF should preserve the selected evidence keys.',
        9000,
        4700,
        reasoning=650,
    )
    repair = Response(
        'STAGE2_HANDOFF\ncompany: PwC\nrole_title: Transfer Pricing - Senior Associate\n'
        'cv_structure: High Experience\nselected_professional_evidence:\n  - key: PR-EY-FAR',
        1200,
        700,
        reasoning=60,
    )
    ai = ai_with([first, repair])

    text, response = ai.text(
        'Stage 2 instructions. You MUST produce STAGE2_HANDOFF.',
        'current application inputs',
        reasoning_effort='medium',
        max_output_tokens=8000,
        model='gpt-5.6-terra',
    )

    assert len(ai.client.responses.calls) == 2
    assert '\n\nSTAGE2_HANDOFF\n' in text
    assert response.usage.input_tokens == 10200
    assert response.usage.output_tokens == 5400


def test_stage2_with_valid_handoff_does_not_make_repair_call():
    first = Response('STAGE2_HANDOFF\ncompany: PwC\ncv_structure: High Experience', 2000, 800)
    ai = ai_with([first])

    text, response = ai.text(
        'Stage 2 instructions. You MUST produce STAGE2_HANDOFF.',
        'current application inputs',
        reasoning_effort='medium',
        max_output_tokens=8000,
        model='gpt-5.6-terra',
    )

    assert len(ai.client.responses.calls) == 1
    assert text.startswith('STAGE2_HANDOFF')
    assert response is first
