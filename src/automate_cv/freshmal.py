import hashlib
import uuid
from datetime import datetime, timezone
from googleapiclient.discovery import build
from .models import ApplicationRow
from .profiles import profiles

STOP_STATES = {'ERROR_MANUAL', 'ERROR_CONFIG', 'JD_CHANGED_REVIEW_REQUIRED', 'ERROR_MAX_RETRIES'}
CONTROLLED_RESET_STATES = {'ERROR_MANUAL', 'ERROR_MAX_RETRIES'}
STATE_KEYS = ('id', 'hash', 'workflow', 'lock', 'last', 'cvlink', 'cllink', 'context', 'cost', 'error')
LOCATION_COL = 32  # AG; optional user-entered location used for Drive folder naming.


def digest(text):
    return hashlib.sha256(text.replace('\r\n', '\n').strip().encode()).hexdigest()


def _v(row, i, d=''):
    return row[i] if i < len(row) else d


def _b(row, i):
    value = _v(row, i, False)
    return value is True or str(value).upper() in {'TRUE', 'YES', '1'}


def col_letter(index):
    n = index + 1
    s = ''
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def retry_count(workflow):
    if not str(workflow).startswith('ERROR_RETRYABLE_'):
        return 0
    try:
        return int(str(workflow).rsplit('_', 1)[1])
    except ValueError:
        return 0


class Freshmal:
    def __init__(self, credentials, settings):
        self.settings = settings
        self.values = build('sheets', 'v4', credentials=credentials, cache_discovery=False).spreadsheets().values()
        self.profiles = profiles()

    def rows(self):
        result = self.values.get(
            spreadsheetId=self.settings.freshmal_spreadsheet_id,
            range=f'{self.settings.freshmal_sheet_name}!A3:AG1000',
            valueRenderOption='UNFORMATTED_VALUE',
        ).execute()
        apps = []
        for n, row in enumerate(result.get('values', []), 3):
            company = str(_v(row, 0))
            designation = str(_v(row, 1))
            link = str(_v(row, 2))
            jd = str(_v(row, 3))
            location = str(_v(row, LOCATION_COL)).strip()
            for p in self.profiles.values():
                make_cv = _b(row, p.make_cv_col)
                make_cl = _b(row, p.make_cl_col)
                ws = _b(row, p.web_search_col)
                if not (make_cv or make_cl or ws):
                    continue
                state = [_v(row, p.state_start_col + i) for i in range(10)]
                apps.append(ApplicationRow(
                    row_number=n,
                    company=company,
                    designation=designation,
                    application_link=link,
                    raw_jd=jd,
                    make_cv=make_cv,
                    make_cl=make_cl,
                    web_search=ws,
                    status=str(_v(row, p.status_col)),
                    candidate_key=p.key,
                    candidate_name=p.display_name,
                    filename_name=p.filename_name,
                    folder_name=p.folder_name,
                    location=location,
                    application_id=str(state[0]),
                    jd_hash=str(state[1]),
                    workflow=str(state[2]),
                    lock_id=str(state[3]),
                    cv_link=str(state[5]),
                    cl_link=str(state[6]),
                    context_link=str(state[7]),
                    cost_usd=float(state[8] or 0),
                    error=str(state[9]),
                ))
        return apps

    def _profile(self, a):
        return self.profiles[a.candidate_key]

    def _lock_stale(self, lock):
        if not lock or '|' not in lock:
            return False
        try:
            stamp = datetime.fromisoformat(lock.split('|', 1)[1])
            if stamp.tzinfo is None:
                stamp = stamp.replace(tzinfo=timezone.utc)
            age = (datetime.now(timezone.utc) - stamp).total_seconds() / 60
            return age >= self.settings.stale_lock_minutes
        except Exception:
            return False

    def eligible(self, a):
        if not a.has_pending_work() or a.workflow in STOP_STATES:
            return False
        if retry_count(a.workflow) >= self.settings.max_row_attempts:
            return False
        if a.lock_id and not self._lock_stale(a.lock_id):
            return False
        return True

    def update(self, a, changes):
        p = self._profile(a)
        mapping = {
            'make_cv': p.make_cv_col,
            'make_cl': p.make_cl_col,
            'web_search': p.web_search_col,
            'status': p.status_col,
        }
        mapping.update({k: p.state_start_col + i for i, k in enumerate(STATE_KEYS)})
        unknown = [k for k in changes if k not in mapping]
        if unknown:
            raise KeyError(f'Unsupported Freshmal update fields: {unknown}')
        data = [
            {
                'range': f'{self.settings.freshmal_sheet_name}!{col_letter(mapping[k])}{a.row_number}',
                'values': [[v]],
            }
            for k, v in changes.items()
        ]
        self.values.batchUpdate(
            spreadsheetId=self.settings.freshmal_spreadsheet_id,
            body={'valueInputOption': 'RAW', 'data': data},
        ).execute()

    def reset_for_controlled(self, a):
        """Allow an explicit human-triggered controlled run to retry manual/max-retry failures.

        Hourly eligibility remains fail-closed. Configuration errors and changed-JD
        review states are not reset automatically.
        """
        if a.workflow not in CONTROLLED_RESET_STATES:
            return False
        self.update(a, {'workflow': '', 'error': '', 'lock': ''})
        a.workflow = ''
        a.error = ''
        a.lock_id = ''
        return True

    def prepare(self, a):
        d = digest(a.raw_jd)
        if a.jd_hash and a.jd_hash != d:
            # A changed JD invalidates prior status/checkpoints. Require a deliberate re-check by the user.
            self.update(a, {
                'make_cv': False,
                'id': '',
                'hash': d,
                'status': 'NA',
                'workflow': 'JD_CHANGED_REVIEW_REQUIRED',
                'lock': '',
                'last': '',
                'cvlink': '',
                'cllink': '',
                'context': '',
                'cost': 0,
                'error': 'JD changed; review the row and re-check Make CV.',
            })
            return False
        if not a.application_id:
            a.application_id = f'{a.candidate_key.upper()}-R{a.row_number}-{d[:8]}'
        a.jd_hash = d
        self.update(a, {'id': a.application_id, 'hash': d})
        return True

    def claim(self, a):
        now = datetime.now(timezone.utc).isoformat()
        lock = f'{uuid.uuid4()}|{now}'
        self.update(a, {'lock': lock, 'workflow': 'CLAIMED', 'last': now, 'error': ''})
        a.lock_id = lock

    def fail(self, a, msg, state='ERROR_RETRYABLE'):
        if state == 'ERROR_RETRYABLE':
            count = retry_count(a.workflow) + 1
            state = 'ERROR_MAX_RETRIES' if count >= self.settings.max_row_attempts else f'ERROR_RETRYABLE_{count}'
        self.update(a, {'workflow': state, 'error': msg[:5000], 'lock': ''})

    def done(self, a, cv, cl, context, cost, web_search_used=False):
        final_cv = cv or a.cv_link
        final_cl = cl or a.cl_link
        status = a.merged_status(
            new_cv=bool(cv),
            new_cl=bool(cl),
            web_search_used=bool(web_search_used),
        )
        self.update(a, {
            'status': status,
            'workflow': 'COMPLETE',
            'cvlink': final_cv,
            'cllink': final_cl,
            'context': context,
            'cost': round(cost, 4),
            'error': '',
            'lock': '',
        })
