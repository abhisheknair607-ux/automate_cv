from dataclasses import dataclass


STATUS_ORDER = ('CV', 'CL', 'WS')


@dataclass
class ApplicationRow:
    row_number: int
    company: str
    designation: str
    application_link: str
    raw_jd: str
    make_cv: bool
    make_cl: bool
    web_search: bool
    status: str
    candidate_key: str = 'abhishek'
    candidate_name: str = 'Abhishek Nair'
    filename_name: str = 'Abhishek_Nair'
    folder_name: str = 'Abhishek'
    location: str = ''
    application_id: str = ''
    jd_hash: str = ''
    workflow: str = ''
    lock_id: str = ''
    cv_link: str = ''
    cl_link: str = ''
    context_link: str = ''
    cost_usd: float = 0.0
    error: str = ''

    def validate(self):
        errors = []
        wants_artifact = self.make_cv or self.make_cl
        if self.web_search and not wants_artifact:
            errors.append('Web Search requires CV and/or Cover Letter to be selected.')
        if wants_artifact and not self.company.strip():
            errors.append('Company Name is blank.')
        if wants_artifact and not self.designation.strip():
            errors.append('Designation is blank.')
        if wants_artifact and not self.raw_jd.strip():
            errors.append('Job Description is blank.')
        return errors

    def status_parts(self):
        value = str(self.status or '').upper().strip()
        if not value or value == 'NA':
            return set()
        return {part.strip() for part in value.split('+') if part.strip() in STATUS_ORDER}

    def cv_done(self):
        return 'CV' in self.status_parts() and bool(self.cv_link)

    def cl_done(self):
        return 'CL' in self.status_parts() and bool(self.cl_link)

    def ws_done(self):
        return 'WS' in self.status_parts()

    def pending_artifacts(self):
        """Return (need_cv, need_cl, need_web_search_refresh).

        Status + stored Drive links are the durable record of completed artifacts.
        A newly selected artifact is generated without regenerating an already
        completed sibling artifact. If Web Search is newly selected after an
        artifact already exists, only the currently selected artifact(s) are
        refreshed so the new research can actually affect the deliverable.
        """
        need_cv = self.make_cv and not self.cv_done()
        need_cl = self.make_cl and not self.cl_done()
        need_ws = self.web_search and not self.ws_done()

        if need_ws:
            if self.make_cv and self.cv_done():
                need_cv = True
            if self.make_cl and self.cl_done():
                need_cl = True
        return need_cv, need_cl, need_ws

    def has_pending_work(self):
        return any(self.pending_artifacts())

    def requested_status(self):
        parts = []
        if self.make_cv:
            parts.append('CV')
        if self.make_cl:
            parts.append('CL')
        if self.web_search and (self.make_cv or self.make_cl):
            parts.append('WS')
        return '+'.join(parts) or 'NA'

    def merged_status(self, new_cv=False, new_cl=False, web_search_used=False):
        parts = set(self.status_parts())
        if self.cv_done() or new_cv:
            parts.add('CV')
        if self.cl_done() or new_cl:
            parts.add('CL')
        if self.ws_done() or web_search_used:
            parts.add('WS')
        ordered = [name for name in STATUS_ORDER if name in parts]
        return '+'.join(ordered) or 'NA'

    def complete(self):
        return bool(self.make_cv or self.make_cl or self.web_search) and not self.has_pending_work()
