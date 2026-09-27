from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

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


def test_terminal_states_never_run_hourly():
    s = sheet()
    for state in ('ERROR_MANUAL', 'ERROR_CONFIG', 'JD_CHANGED_REVIEW_REQUIRED', 'ERROR_MAX_RETRIES'):
        assert not s.eligible(app(workflow=state))


def test_retryable_row_can_run_but_ceiling_stops_it():
    s = sheet()
    assert retry_count('ERROR_RETRYABLE_2') == 2
    assert s.eligible(app(workflow='ERROR_RETRYABLE_2'))
    assert not s.eligible(app(workflow='ERROR_RETRYABLE_3'))


def test_fresh_lock_blocks_and_stale_lock_recovers():
    s = sheet()
    now = datetime.now(timezone.utc)
    assert not s.eligible(app(lock_id=lock_at(now - timedelta(minutes=10))))
    assert s.eligible(app(lock_id=lock_at(now - timedelta(minutes=181))))


def test_complete_row_is_not_eligible():
    assert not sheet().eligible(app(status='CV', cv_link='drive-link'))


def test_profile_columns_are_independent():
    p = profiles()
    assert (p['pooja'].make_cv_col, p['pooja'].make_cl_col, p['pooja'].web_search_col, p['pooja'].status_col) == (4, 5, 6, 10)
    assert (p['abhishek'].make_cv_col, p['abhishek'].make_cl_col, p['abhishek'].web_search_col, p['abhishek'].status_col) == (7, 8, 9, 11)
    assert p['pooja'].state_start_col != p['abhishek'].state_start_col
