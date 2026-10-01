from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from automate_cv.freshmal import Freshmal, retry_count
from automate_cv.models import ApplicationRow
from automate_cv.profiles import profiles


def app(**kw):
    data = dict(
        row_number=3,
        company='Example',
        designation='Analyst',
        application_link='x',
        raw_jd='JD',
        make_cv=True,
        make_cl=False,
        web_search=False,
        status='NA',
        candidate_key='abhishek',
        candidate_name='Abhishek Nair',
        filename_name='Abhishek_Nair',
        folder_name='Abhishek',
    )
    data.update(kw)
    return ApplicationRow(**data)


def sheet():
    obj = Freshmal.__new__(Freshmal)
    obj.settings = SimpleNamespace(max_row_attempts=3, stale_lock_minutes=180)
    return obj


def lock_at(dt):
    return f'abc|{dt.isoformat()}'


def test_terminal_state_requires_explicit_error_retry_signal():
    s = sheet()
    states = ('ERROR_MANUAL', 'ERROR_CONFIG', 'JD_CHANGED_REVIEW_REQUIRED', 'ERROR_MAX_RETRIES')
    for state in states:
        # Historical/ambiguous terminal state does not silently restart.
        assert not s.eligible(app(workflow=state, status='NA'))
        # fail() unticks Make CV; while unticked the row remains stopped.
        assert not s.eligible(app(workflow=state, status='ERROR', make_cv=False))
        # Re-checking Make CV after a visible ERROR is an explicit manual retry.
        assert s.eligible(app(workflow=state, status='ERROR', make_cv=True))


def test_retryable_row_can_run_but_ceiling_stops_it():
    s = sheet()
    assert retry_count('ERROR_RETRYABLE_2') == 2
    assert s.eligible(app(workflow='ERROR_RETRYABLE_2', status='ERROR'))
    assert not s.eligible(app(workflow='ERROR_RETRYABLE_3', status='ERROR'))


def test_terminal_failure_marks_error_and_unticks_make_cv():
    s = sheet()
    captured = {}
    s.update = lambda _app, changes: captured.update(changes)

    s.fail(app(), 'QA failed', 'ERROR_MANUAL')

    assert captured['status'] == 'ERROR'
    assert captured['workflow'] == 'ERROR_MANUAL'
    assert captured['make_cv'] is False
    assert captured['error'] == 'QA failed'
    assert captured['lock'] == ''


def test_retryable_failure_marks_error_without_disabling_automatic_retry():
    s = sheet()
    captured = {}
    s.update = lambda _app, changes: captured.update(changes)

    s.fail(app(workflow='ERROR_RETRYABLE_1'), 'temporary outage')

    assert captured['status'] == 'ERROR'
    assert captured['workflow'] == 'ERROR_RETRYABLE_2'
    assert 'make_cv' not in captured


def test_retry_ceiling_becomes_terminal_and_requires_recheck():
    s = sheet()
    captured = {}
    s.update = lambda _app, changes: captured.update(changes)

    s.fail(app(workflow='ERROR_RETRYABLE_2'), 'temporary outage')

    assert captured['status'] == 'ERROR'
    assert captured['workflow'] == 'ERROR_MAX_RETRIES'
    assert captured['make_cv'] is False


def test_changed_jd_is_visible_error_and_requires_recheck():
    s = sheet()
    captured = {}
    s.update = lambda _app, changes: captured.update(changes)
    a = app(jd_hash='old-hash')

    assert s.prepare(a) is False
    assert captured['status'] == 'ERROR'
    assert captured['workflow'] == 'JD_CHANGED_REVIEW_REQUIRED'
    assert captured['make_cv'] is False
    assert captured['output_folder'] == ''


def test_fresh_lock_blocks_and_stale_lock_recovers():
    s = sheet()
    now = datetime.now(timezone.utc)
    assert not s.eligible(app(lock_id=lock_at(now - timedelta(minutes=10))))
    assert s.eligible(app(lock_id=lock_at(now - timedelta(minutes=181))))


def test_complete_row_is_not_eligible():
    assert not sheet().eligible(app(status='CV', cv_link='drive-link'))


@pytest.mark.parametrize('candidate_key', ['pooja', 'abhishek'])
@pytest.mark.parametrize('status', ['Applied', 'APPLIED', ' applied '])
@pytest.mark.parametrize('cv_link', ['', 'drive-link'])
@pytest.mark.parametrize('workflow', ['', 'COMPLETE', 'ERROR_RETRYABLE_1', 'ERROR_MANUAL'])
def test_applied_always_skips_checked_make_cv(candidate_key, status, cv_link, workflow):
    assert not sheet().eligible(app(
        candidate_key=candidate_key,
        status=status,
        cv_link=cv_link,
        workflow=workflow,
        make_cv=True,
        make_cl=True,
        web_search=True,
    ))


@pytest.mark.parametrize('candidate_key', ['pooja', 'abhishek'])
def test_applied_skip_does_not_block_other_candidate_on_same_row(candidate_key):
    other = 'abhishek' if candidate_key == 'pooja' else 'pooja'
    assert not sheet().eligible(app(candidate_key=candidate_key, status='Applied'))
    assert sheet().eligible(app(candidate_key=other, status='NA'))


def test_profile_columns_are_independent():
    p = profiles()
    assert (p['pooja'].make_cv_col, p['pooja'].make_cl_col, p['pooja'].web_search_col, p['pooja'].status_col) == (4, 5, 6, 10)
    assert (p['abhishek'].make_cv_col, p['abhishek'].make_cl_col, p['abhishek'].web_search_col, p['abhishek'].status_col) == (7, 8, 9, 11)
    assert p['pooja'].state_start_col != p['abhishek'].state_start_col
    assert p['pooja'].output_folder_col == 35
    assert p['abhishek'].output_folder_col == 36


@pytest.mark.parametrize('candidate_key,folder_column,status_column', [
    ('pooja', 'AJ', 'K'),
    ('abhishek', 'AK', 'L'),
])
def test_done_saves_output_folder_with_cv_in_candidate_columns(candidate_key, folder_column, status_column):
    s = sheet()
    s.profiles = profiles()
    s.settings.freshmal_spreadsheet_id = 'sheet-id'
    s.settings.freshmal_sheet_name = 'Sheet1'
    captured = {}

    def batch_update(**kwargs):
        captured.update(kwargs)
        return SimpleNamespace(execute=lambda: {})

    s.values = SimpleNamespace(batchUpdate=batch_update)
    s.done(app(candidate_key=candidate_key), 'cv-link', '', 'context-link', 0.5,
           output_folder='https://drive.google.com/drive/folders/role-folder')
    data = {entry['range']: entry['values'][0][0] for entry in captured['body']['data']}
    assert data[f'Sheet1!{folder_column}3'] == 'https://drive.google.com/drive/folders/role-folder'
    assert data[f'Sheet1!{status_column}3'] == 'CV'
    cv_column = 'AB' if candidate_key == 'pooja' else 'R'
    assert data[f'Sheet1!{cv_column}3'] == 'cv-link'
    assert captured['body']['valueInputOption'] == 'RAW'
    assert not any(key.startswith('Sheet1!AH') or key.startswith('Sheet1!AI') for key in data)
