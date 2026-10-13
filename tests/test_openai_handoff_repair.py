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


def test_stage2_mentions_marker_in_prose_still_triggers_repair():
    first = Response(
        'The STAGE2_HANDOFF should summarize the selected evidence, but here is only analysis.',
        4000,
        2000,
        reasoning=200,
    )
    repair = Response(
        'STAGE2_HANDOFF\ncompany: PwC\ncv_structure: High Experience\n'
        'selected_professional_evidence:\n  - key: PR-EY-FAR',
        800,
        500,
        reasoning=40,
    )
    ai = ai_with([first, repair])

    text, _ = ai.text(
        'Stage 2 instructions. You MUST produce STAGE2_HANDOFF.',
        'current application inputs',
        reasoning_effort='medium',
        max_output_tokens=8000,
        model='gpt-5.6-terra',
    )

    assert len(ai.client.responses.calls) == 2
    assert '\nSTAGE2_HANDOFF\n' in f'\n{text}\n'


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


def test_cache_prefix_context_is_still_sent_when_explicit_cache_is_disabled():
    first = Response('STAGE2_HANDOFF\ncompany: PwC\nselected_professional_evidence: []', 2000, 800)
    ai = ai_with([first])

    ai.text(
        'Stage 2 instructions. You MUST produce STAGE2_HANDOFF.',
        'current application inputs',
        reasoning_effort='medium',
        max_output_tokens=8000,
        model='gpt-5.6-terra',
        cache_prefix='COMPACT SUMMARY DOC / EVIDENCE ROUTER\nPR-EY-FAR -> EY FAR evidence',
        cache_key='abhishek:stage2',
    )

    assert len(ai.client.responses.calls) == 1
    call = ai.client.responses.calls[0]
    assert 'COMPACT SUMMARY DOC / EVIDENCE ROUTER' in call['instructions']
    assert 'PR-EY-FAR' in call['instructions']
    assert 'prompt_cache_options' not in call
    assert call['input'] == 'current application inputs'


def test_truncated_fortis_yaml_is_repaired_without_repeating_analysis():
    truncated = (
        '# Evidence selection\nProfessional selections: PR-EY-FINTRANS and P12.\n'
        '## STAGE2_HANDOFF\n' + '```yaml\n'
        'company: Fortis Recruitment\ncv_structure: High Experience\n'
        'critical_requirements:\n  - id: R1\n'
        '    selected_evidence_keys: [PR-EY-FINTRANS, P12]\n'
        '  - id: R2\n    need: "Incomplete'
    )
    repair = Response(
        'STAGE2_HANDOFF\ncompany: Fortis Recruitment\ncv_structure: High Experience\n'
        'selected_professional_evidence:\n  - key: PR-EY-FINTRANS\n'
        'selected_projects:\n  - id: P12\n'
        'stage3_evidence_to_retrieve_or_verify: [PR-EY-FINTRANS, P12]',
        1700, 1100,
    )
    ai = ai_with([Response(truncated, 8820, 8000, reasoning=3336), repair])
    result, combined = ai.text(
        'Merged analysis instructions with STAGE2_HANDOFF',
        'Fortis Investment Analyst JD',
        max_output_tokens=8000,
        model='gpt-6-luna',
    )
    assert len(ai.client.responses.calls) == 2
    assert 'Professional selections: PR-EY-FINTRANS and P12.' in result
    assert 'Incomplete' not in result
    assert result.count('STAGE2_HANDOFF') == 1
    assert 'selected_professional_evidence:' in result
    assert combined.usage.output_tokens == 9100
