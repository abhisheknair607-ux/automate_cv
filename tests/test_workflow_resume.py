from types import SimpleNamespace

from automate_cv.workflow import Workflow, _usage, _transient


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


class FakeOutputDetails:
    reasoning_tokens = 250


class FakeUsage:
    input_tokens = 1000
    output_tokens = 500
    input_tokens_details = FakeTokenDetails()
    output_tokens_details = FakeOutputDetails()


class FakeResponse:
    usage = FakeUsage()


def workflow_for_helpers():
    w = Workflow.__new__(Workflow)
    w.s = SimpleNamespace(drive_output_folder_id='outputs')
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

    k2 = w._checkpoint_key_stage2(k1, 'prompt two', 'summary', 'stage one output')
    assert k2['summary_hash']
    assert k2['stage1_output_hash']
    changed_summary = w._checkpoint_key_stage2(k1, 'prompt two', 'new summary', 'stage one output')
    assert changed_summary != k2


def test_usage_reports_cached_reasoning_and_cost():
    result = _usage(FakeResponse())
    assert result['input'] == 1000
    assert result['cached'] == 400
    assert result['uncached'] == 600
    assert result['output'] == 500
    assert result['reasoning'] == 250
    assert result['cost'] > 0


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
