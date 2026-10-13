from types import SimpleNamespace

import pytest

from automate_cv.model_presets import resolve_preset, MODEL_PRESETS
from automate_cv.models import ApplicationRow
from automate_cv.profiles import profiles
from automate_cv.runner import prepare_application
from automate_cv.workflow import _usage, Workflow


def application(candidate='abhishek', tier='Premium'):
    return ApplicationRow(3, 'Test', 'Analyst', 'https://example.org', 'JD', True,
                          False, False, 'NA', candidate_key=candidate, model_tier=tier)


def test_tier_default_keeps_production_routing():
    assert resolve_preset('').tier == 'Premium'
    assert resolve_preset(None).stage3 == 'gpt-5.6-sol'
    assert resolve_preset(' premium ').stage2 == 'gpt-5.6-terra'
    assert set(MODEL_PRESETS) == {'Economy', 'Balanced', 'Premium'}


@pytest.mark.parametrize('tier,merged_model,creator', [
    ('Economy', 'gpt-6-luna', 'gpt-6-luna'),
    ('Balanced', 'gpt-6-luna', 'gpt-6.1-sol'),
    ('Premium', 'gpt-5.6-terra', 'gpt-5.6-sol'),
])
def test_effective_models_for_merged_and_docx_stages(tier, merged_model, creator):
    wf = SimpleNamespace(s=None, sources=SimpleNamespace(), ai=SimpleNamespace())
    job = application(tier=tier)
    prepare_application(wf, job)
    assert wf.s.stage2_model == merged_model
    assert wf.s.stage3_model == creator
    assert wf.sources.make_cover_letter is False
    wf2 = Workflow.__new__(Workflow)
    wf2.s = wf.s
    assert wf2._checkpoint_key_stage1(job, 'prompt')['stage1_model'] == wf.s.stage1_model


def test_candidate_controls_and_tiers_are_isolated():
    p = profiles()
    assert p['abhishek'].model_tier_col == 43
    assert p['pooja'].model_tier_col == 44
    wf = SimpleNamespace(s=None, sources=SimpleNamespace(), ai=SimpleNamespace())
    a = application(tier='Economy')
    b = application(candidate='pooja', tier='Premium')
    prepare_application(wf, a)
    prior = wf.s
    prepare_application(wf, b)
    assert prior.stage3_model == 'gpt-6-luna'
    assert wf.s.stage3_model == 'gpt-5.6-sol'
    assert a.model_tier == 'Economy' and b.model_tier == 'Premium'


@pytest.mark.parametrize('label', ['economy-fast', 'gpt-6-luna', 'unknown', ''])
def test_invalid_or_blank_preset(label):
    if not label:
        assert resolve_preset(label).tier == 'Premium'
    else:
        with pytest.raises(ValueError, match='Unsupported'):
            resolve_preset(label)


def test_actual_pricing_of_new_models_is_counted():
    usage = SimpleNamespace(input_tokens=1000, output_tokens=1000,
                            input_tokens_details=SimpleNamespace(cached_tokens=0,
                            cache_write_tokens=0), output_tokens_details=None)
    response = SimpleNamespace(usage=usage, output=[])
    assert _usage(response, 'gpt-6-luna')['model_api_cost'] == pytest.approx(0.0006)
    assert _usage(response, 'gpt-6.1-sol')['model_api_cost'] == pytest.approx(0.012)
