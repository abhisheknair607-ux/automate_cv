from dataclasses import dataclass

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
        errors=[]
        if self.make_cv and not self.company.strip(): errors.append('Company Name is blank.')
        if self.make_cv and not self.designation.strip(): errors.append('Designation is blank.')
        if self.make_cv and not self.raw_jd.strip(): errors.append('Job Description is blank.')
        if self.web_search and not self.make_cl: errors.append('Web Search requires Make CL; Freshmal has no CV+WS status.')
        return errors

    def requested_status(self):
        if not self.make_cv: return 'NA'
        if self.make_cl and self.web_search: return 'CV+CL+WS'
        if self.make_cl: return 'CV+CL'
        return 'CV'

    def complete(self):
        return self.status in {'CV','CV+CL','CV+CL+WS'} and bool(self.cv_link)
