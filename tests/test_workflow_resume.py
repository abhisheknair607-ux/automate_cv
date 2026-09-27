from types import SimpleNamespace

from automate_cv.workflow import Workflow, _extract_handoff, _transient, _usage


class FakeDrive:
    def __init__(self):
        self.calls = []
        self.next_id = 0

    def folder(self, name, parent):
        self.calls.append((name, parent))
        self.next_id += 1
        return f'id-{self.next_id}', f'https://drive/{self.next_id}'


class FakeTokenDetails:
    cached_tokens = 400
    cache_write_tokens = 100


class FakeOutputDetails:
    reasoning_tokens = 250


class FakeUsage:
    input_tokens = 1000
    output_tokens = 500
    input_tokens_details = FakeTokenDetails()
    output_tokens_details = FakeOutputDetails()


class FakeResponse:
    model = 'gpt-5.6-terra'
    usage = FakeUsage()
    output = []


class FakeStage3Response(FakeResponse):
    output = [
        SimpleNamespace(type='code_interpreter_call', container_id='container-1'),
        SimpleNamespace(type='code_interpreter_call', container_id='container-1'),
        SimpleNamespace(
            type='web_search_call',
            action=SimpleNamespace(type='search'),
        ),
        SimpleNamespace(
            type='web_search_call',
            action=SimpleNamespace(type='open_page'),
        ),
    ]


def workflow_for_helpers():
    w = Workflow.__new__(Workflow)
    w.s = SimpleNamespace(
        drive_output_folder_id='outputs',
        stage1_model='gpt-5.6-terra',
        stage1_reasoning_effort='low',
        stage2_model='gpt-5.6-terra',
        stage2_reasoning_effort='medium',
    )
    w.drive = FakeDrive()
    return w


def test_stage_checkpoint_keys_fail_closed_when_inputs_change():
    w = workflow_for_helpers()
    app = SimpleNamespace(candidate_key='abhishek', jd_hash='jd-a')
    k1 = w._checkpoint_key_stage1(app, 'prompt one')
    manifest = dict(k1, stage1_complete=True)
    assert w._matches(manifest, k1)

    changed = SimpleNamespace(candidate_key='abhishek', jd_hash='jd-b')
    assert not w._matches(manifest, w._checkpoint_key_stage1(changed, 'prompt one'))
    assert not w._matches(manifest, w._checkpoint_key_stage1(app, 'changed prompt'))

    k2 = w._checkpoint_key_stage2(k1, 'prompt two', 'summary', 'stage one handoff')
    assert k2['summary_hash']
    assert k2['stage1_handoff_hash']
    changed_summary = w._checkpoint_key_stage2(k1, 'prompt two', 'new summary', 'stage one handoff')
    assert changed_summary != k2


def test_usage_reports_cache_write_cached_reasoning_and_terra_cost():
    result = _usage(FakeResponse())
    assert result['model'] == 'gpt-5.6-terra'
    assert result['input'] == 1000
    assert result['cached'] == 400
    assert result['cache_write'] == 100
    assert result['uncached'] == 600
    assert result['standard_input'] == 500
    assert result['output'] == 500
    assert result['reasoning'] == 250
    assert result['model_api_cost'] == 0.00733
    assert result['tool_cost_estimate'] == 0.0
    assert result['cost'] == 0.00733


def test_usage_adds_one_container_session_and_only_billable_web_search_actions():
    result = _usage(FakeStage3Response())
    assert result['code_interpreter_calls'] == 2
    assert result['code_interpreter_sessions'] == 1
    assert result['web_search_calls'] == 1
    assert result['tool_cost_estimate'] == 0.04
    assert result['model_api_cost'] == 0.00733
    assert result['cost'] == 0.04733


def test_extract_handoff_accepts_numbered_heading_and_keeps_only_yaml():
    output = '''Human-readable audit summary.\n\n## 9. STAGE1_HANDOFF\n\n```yaml\nrole_family: transfer_pricing\nrequirements:\n  - R1\n```\n\n## Later audit section\nignored'''
    assert _extract_handoff(output, 'STAGE1_HANDOFF') == (
        'STAGE1_HANDOFF\nrole_family: transfer_pricing\nrequirements:\n  - R1'
    )


def test_folder_hierarchy_puts_candidate_immediately_under_outputs():
    w = workflow_for_helpers()
    app = SimpleNamespace(
        folder_name='Pooja',
        company='EY',
        designation='Transfer Pricing Senior Associate',
        location='London',
    )
    folder_id, _ = w._folders(app)
    assert folder_id == 'id-3'
    assert w.drive.calls == [
        ('Pooja', 'outputs'),
        ('EY', 'id-1'),
        ('Transfer Pricing Senior Associate, London', 'id-2'),
    ]


def test_non_transient_validation_error_is_not_retried():
    assert not _transient(ValueError('bad input'))


def test_transient_status_codes_are_retryable():
    error = RuntimeError('rate limited')
    error.status_code = 429
    assert _transient(error)
