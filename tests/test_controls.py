from automate_cv.models import ApplicationRow

def app(**kw):
    d=dict(row_number=3,company='Example',designation='Analyst',application_link='x',raw_jd='JD',make_cv=True,make_cl=False,web_search=False,status='NA'); d.update(kw); return ApplicationRow(**d)

def test_cv_only(): assert app().requested_status()=='CV' and app().validate()==[]
def test_cv_cl(): assert app(make_cl=True).requested_status()=='CV+CL'
def test_cv_cl_ws(): assert app(make_cl=True,web_search=True).requested_status()=='CV+CL+WS'
def test_ws_without_cl_rejected(): assert app(web_search=True).validate()
def test_completed(): assert app(status='CV',cv_link='drive').complete()
