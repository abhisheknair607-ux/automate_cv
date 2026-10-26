"""Stage 4 guardrails: identical vacancies are suppressed without deleting rows."""
from automate_cv.taaza_sync import candidates, exact_job_key


def master(url, company="EY", title="Finance Analyst"):
    return [company, title, url] + [""] * 10


def test_cross_host_linkedin_identity_master_to_regional():
    first = "https://uk.linkedin.com/jobs/view/4499999001?trk=email"
    other = "https://www.linkedin.com/comm/jobs/view/4499999001/?utm_source=social"
    assert exact_job_key(first) == exact_job_key(other)
    additional, counts = candidates([master(first)], {"TP Europe": [master(other)]})
    assert additional == []
    assert counts["TP Europe"] == 0


def test_indeed_tracking_links_do_not_duplicate():
    a = "https://ie.indeed.com/rc/clk/dl?jk=0536af9cba329ebb&trk=x"
    b = "https://ie.indeed.com/viewjob?jk=0536af9cba329ebb"
    assert exact_job_key(a) == exact_job_key(b)
    additions, counts = candidates([master(a)], {"Pooja Europe": [master(b)]})
    assert not additions
    assert counts == {"Pooja Europe": 0}


def test_same_company_title_different_requisition_kept():
    master_a = master("https://www.linkedin.com/jobs/view/4499999001")
    candidate_b = master("https://www.linkedin.com/jobs/view/4499999002")
    additions, counts = candidates([master_a], {"TP Europe": [candidate_b]})
    assert len(additions) == 1
    assert additions[0][10] is False
    assert counts["TP Europe"] == 1


def test_duplicate_within_sources_added_once():
    url = "https://www.linkedin.com/jobs/view/4499999001"
    source = {"TP Europe": [master(url)], "Pooja Europe": [master(url)]}
    additions, counts = candidates([], source)
    assert len(additions) == 1
    assert counts == {"TP Europe": 1, "Pooja Europe": 0}


def test_cross_source_canonical_url_tracking_removed():
    original = "https://careers.example.org/job/transfer-pricing?utm_source=linkedin"
    duplicate = "https://careers.example.org/job/transfer-pricing?utm_source=indeed"
    assert exact_job_key(original) == exact_job_key(duplicate)
    additions, counts = candidates([master(original)], {"TP Europe": [master(duplicate)]})
    assert not additions
    assert counts == {"TP Europe": 0}


def test_invalid_url_fails_closed_and_master_rows_preserved():
    additions, counts = candidates([master("https://example.org/a")],
                                   {"TP Europe": [master("javascript:alert(1)")]})
    assert not additions
    assert counts == {"TP Europe": 0}
