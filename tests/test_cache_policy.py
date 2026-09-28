from types import SimpleNamespace

from automate_cv.openai_client import AI
from automate_cv.runner import configure_batch


def _app(candidate):
    return SimpleNamespace(candidate_key=candidate)


def test_single_application_batch_does_not_enable_prompt_cache():
    ai = AI.__new__(AI)
    ai.cache_candidates = set()
    workflow = SimpleNamespace(ai=ai)
    configure_batch(workflow, [_app('abhishek')])
    assert workflow.ai.cache_candidates == set()
    assert not workflow.ai._cache_allowed('abhishek:stage1')


def test_same_candidate_multi_application_batch_enables_prompt_cache():
    ai = AI.__new__(AI)
    ai.cache_candidates = set()
    workflow = SimpleNamespace(ai=ai)
    configure_batch(workflow, [_app('abhishek'), _app('abhishek'), _app('pooja')])
    assert workflow.ai.cache_candidates == {'abhishek'}
    assert workflow.ai._cache_allowed('abhishek:stage1')
    assert workflow.ai._cache_allowed('abhishek:stage2')
    assert not workflow.ai._cache_allowed('pooja:stage1')
