from types import SimpleNamespace

from automate_cv.config import Settings
from automate_cv.workflow import _usage


def test_quality_first_stage_model_defaults():
    s = Settings(_env_file=None)
    assert s.stage1_model == 'gpt-5.6-terra'
    assert s.stage1_reasoning_effort == 'low'
    assert s.stage2_model == 'gpt-5.6-sol'
    assert s.stage2_reasoning_effort == 'medium'
    assert s.stage3_model == 'gpt-5.6-sol'
    assert s.stage3_reasoning_effort == 'medium'


def test_usage_cost_is_model_aware():
    usage = SimpleNamespace(
        input_tokens=1000,
        output_tokens=1000,
        input_tokens_details=SimpleNamespace(cached_tokens=0),
        output_tokens_details=SimpleNamespace(reasoning_tokens=100),
    )
    response = SimpleNamespace(usage=usage)
    terra = _usage(response, 'gpt-5.6-terra')
    sol = _usage(response, 'gpt-5.6-sol')
    assert terra['model'] == 'gpt-5.6-terra'
    assert terra['cost'] == 0.014
    assert sol['cost'] == 0.024
    assert terra['cost'] < sol['cost']
