"""Stage 1 regression tests: local-only, no production data or service calls."""
import json

import pytest

from automate_cv.job_dedupe import Job, analyze, compare, identity, location_key, matches_for


def job(row, company="EY", title="Transfer Pricing Senior Consultant",
        location="Dublin, Ireland", url=None, **options):
    if url is None:
        url = "https://www.linkedin.com/jobs/view/4499999001/"
    return Job("Jobs", row, company, title, location, url, **options)


def test_verified_linkedin_identity_ignores_tracking_and_redirect_shape():
    a = "https://www.linkedin.com/comm/jobs/view/4499999001?trk=email&trackingId=123"
    b = "https://linkedin.com/jobs/view/4499999001/?utm_source=alert"
    assert identity(a) == identity(b) == ("id", "linkedin:4499999001")


def test_verified_indeed_identity_across_alert_and_viewjob_links():
    a = "https://ie.indeed.com/rc/clk/dl?jk=0536af9cba329ebb&from=ja&trk=x"
    b = "https://ie.indeed.com/viewjob?jk=0536af9cba329ebb"
    assert identity(a) == identity(b) == ("id", "indeed:0536af9cba329ebb")


@pytest.mark.parametrize("bad", [
    "", "not a URL", "javascript:alert(1)", "https://",
    "https://linkedin.com.evil.com/jobs/view/4499999001",
])
def test_invalid_urls_are_not_verified_as_job_ids(bad):
    kind, key = identity(bad)
    assert not key.startswith("linkedin:")


def test_same_exact_url_across_two_rows():
    rows = [
        job(2, url="https://careers.example.org/vacancy/finance-analyst?utm_source=linkedin"),
        job(4, url="https://careers.example.org/vacancy/finance-analyst?utm_campaign=email"),
    ]
    report = analyze(rows)
    assert len(report.exact_pairs) == 1
    assert report.exact_pairs[0].kind == "EXACT_URL"
    assert not report.exact_pairs[0].auto_delete
    assert report.groups == [["Jobs!2", "Jobs!4"]]


def test_exact_id_on_different_titles_requires_metadata_review():
    a = job(2, "JPMorganChase", "Financial Analyst")
    b = job(5, "Different Employer", "Head of Marketing",
            url="https://www.linkedin.com/comm/jobs/view/4499999001")
    m = compare(a, b)
    assert m.kind == "EXACT_ID"
    assert "metadata conflict" in m.reason
    assert not m.auto_delete


def test_fuzzy_ey_alias_matches_only_as_possible():
    a = job(2, company="EY", title="Senior Transfer Pricing Consultant",
            url="https://www.linkedin.com/jobs/view/4499999001/")
    b = job(3, company="Ernst & Young", title="Senior Transfer Pricing Consultant",
            location="Dublin, County Dublin",
            url="https://ie.indeed.com/viewjob?jk=0536af9cba329ebb")
    audit = analyze([a, b])
    assert not audit.exact_pairs
    assert len(audit.possible_pairs) == 1
    assert audit.possible_pairs[0].score == 100


def test_similar_role_different_level_is_not_flagged():
    records = [
        job(2, title="Finance Manager"),
        job(3, title="Senior Finance Manager", url="https://jobs.example.com/456"),
        job(4, title="Assistant Finance Manager", url="https://jobs.example.com/457"),
    ]
    report = analyze(records)
    assert not report.possible_pairs


def test_identical_title_same_company_but_different_cities_not_flagged():
    a = job(2)
    b = job(3, location="London, United Kingdom", url="https://jobs.example.com/789")
    assert compare(a, b) is None


def test_remote_without_verified_city_not_fuzzy_matched():
    a = job(2, location="Remote", url="https://a.example.org/posting/1")
    b = job(3, location="Remote", url="https://b.example.org/posting/2")
    assert compare(a, b) is None


def test_country_only_location_is_not_fuzzy_matched():
    a = job(2, location="Ireland", url="https://a.example.org/posting/1")
    b = job(3, location="Ireland", url="https://b.example.org/posting/2")
    assert location_key("Ireland") == ""
    assert compare(a, b) is None


def test_different_company_is_not_fuzzy_matched():
    a = job(2, company="EY", url="https://site1.example.com/1")
    b = job(3, company="PwC", url="https://site2.example.com/2")
    assert compare(a, b) is None


def test_same_company_title_city_different_requisition_ids_requires_review():
    a = job(2, url="https://www.linkedin.com/jobs/view/4499999001/")
    b = job(3, url="https://www.linkedin.com/jobs/view/4499999002/")
    report = analyze([a, b])
    assert not report.exact_pairs
    assert len(report.possible_pairs) == 1


def test_no_auto_remove_even_with_jd_or_application_protection():
    a = job(2, has_jd=True, protected=True)
    b = job(3, url="https://www.linkedin.com/comm/jobs/view/4499999001")
    report = analyze([a, b])
    assert report.exact_pairs[0].auto_delete is False


def test_source_tab_mirror_should_not_be_in_master_audit():
    master = job(2)
    mirror = Job("TP Europe", 2, master.company, master.title, master.location, master.url)
    # The caller audits MASTER rows only; the two are expected to be mirrored.
    assert analyze([master]).exact_pairs == []
    assert matches_for(mirror, [master])[0].kind == "EXACT_ID"


def test_repeated_run_deterministic_and_never_mutates_inputs():
    records = [job(2), job(3, url="https://www.linkedin.com/comm/jobs/view/4499999001"),
               job(4, url="https://jobs.example.org/other")]
    old = repr(records)
    first = analyze(records).to_dict()
    assert first == analyze(records).to_dict()
    assert repr(records) == old
    assert len(first["exact_pairs"]) == 1
    assert "auto_delete" in first["exact_pairs"][0]
    assert first["exact_pairs"][0]["auto_delete"] is False


def test_duplicate_row_reference_raises_error_instead_of_guessing():
    with pytest.raises(ValueError, match="Duplicate input"):
        analyze([job(2), job(2)])


def test_invalid_row_reference_raises_error():
    with pytest.raises(ValueError, match="valid sheet"):
        analyze([job(1)])


def test_audit_json_has_no_live_data_or_sheet_writes():
    report = analyze([job(2), job(3)])
    encoded = json.dumps(report.to_dict())
    assert '"records": 2' in encoded
    assert '"auto_delete": false' in encoded
