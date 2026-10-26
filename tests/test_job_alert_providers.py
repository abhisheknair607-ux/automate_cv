"""Provider-adapter tests based on minimal, non-identifying 25 Oct 2026 Indeed samples."""
from automate_cv.job_alert_providers import (
    provider_for, eligible_location, indeed_job_key, parse_indeed,
)


def email_sample():
    return """Indeed Job Alert
14 new valuation jobs in Dublin, County Dublin

Jobs 1-14 of 14 new jobs
See matching results on Indeed: https://ie.indeed.com/jobs?q=valuation

Graduate Associate, M&A
Interpath Advisory - Dublin, County Dublin
Easily apply
Assisting with financial models and valuation analyses.
3 days ago
https://ie.indeed.com/rc/clk/dl?jk=0536af9cba329ebb&from=ja&trk=ignore

Commercial and Finance Analyst
DAA - Dublin, County Dublin
The Commercial and Finance Analyst provides financial analysis.
5 days ago
https://ie.indeed.com/pagead/clk/dl?mo=r&ad=TRACKING-ONLY

Production Accountant, Entertainment & Music genres
RTÉ - Dublin, County Dublin
€52,854–€70,282 a year
Responsive employer
A production accounting role.
3 days ago
https://ie.indeed.com/rc/clk/dl?jk=65c671caa889fd5c&from=ja

Fund Accounting (Alternatives) Associate 2
State Street - Dublin, County Dublin
Valuation and NAV calculations.
2 days ago
https://ie.indeed.com/rc/clk/dl?jk=eb0f7c2b9a9942bc&from=ja
"""


def test_observed_25_oct_indeed_template_extracts_only_job_rows():
    jobs, uncertain, ads = parse_indeed(email_sample())
    assert uncertain is False
    assert ads == 1
    assert len(jobs) == 3
    assert [(j.company, j.title, j.location) for j in jobs] == [
        ("Interpath Advisory", "Graduate Associate, M&A", "Dublin, County Dublin"),
        ("RTÉ", "Production Accountant, Entertainment & Music genres",
         "Dublin, County Dublin"),
        ("State Street", "Fund Accounting (Alternatives) Associate 2",
         "Dublin, County Dublin"),
    ]
    assert jobs[0].url == "https://ie.indeed.com/viewjob?jk=0536af9cba329ebb"
    assert jobs[1].salary == "€52,854–€70,282 a year"
    assert "tracking" not in str(jobs).lower()


def test_indeed_deduplicates_and_ignores_unverifiable_ad():
    jobs, uncertain, ads = parse_indeed(
        email_sample() + "\n" + email_sample().split("\n\n", 2)[-1]
    )
    assert not uncertain
    assert ads >= 1
    assert len(jobs) == 3


def test_malformed_card_fails_closed_for_manual_review():
    jobs, uncertain, ads = parse_indeed(
        "Indeed Job Alert\n\nTax Manager\nMissing company and location\n"
        "https://ie.indeed.com/rc/clk/dl?jk=1111222233334444"
    )
    assert jobs == []
    assert uncertain
    assert ads == 0


def test_exact_senders_and_nonverified_partner_sources():
    assert provider_for('Indeed <donotreply@jobalert.indeed.com>') == ("Indeed", True)
    assert provider_for('LinkedIn <jobalerts-noreply@linkedin.com>') == ("LinkedIn", True)
    assert provider_for('alerts@irishjobs.ie') == ("IrishJobs", False)
    assert provider_for('alerts@jobs.ie') == ("Jobs.ie", False)
    assert provider_for('Fake <donotreply@jobalert.indeed.com.evil.org>') == (None, False)
    assert provider_for("marketing@indeed.com") == (None, False)


def test_indeed_links_must_have_real_job_key():
    assert indeed_job_key("https://ie.indeed.com/rc/clk/dl?jk=0536af9cba329ebb&trk=x") == "0536af9cba329ebb"
    assert indeed_job_key("https://ie.indeed.com/viewjob?jk=0536af9cba329ebb") == "0536af9cba329ebb"
    assert indeed_job_key("https://ie.indeed.com/pagead/clk/dl?ad=random") is None
    assert indeed_job_key("https://phishing-indeed.com/viewjob?jk=0536af9cba329ebb") is None


def test_geography_excludes_mumbai_and_overseas_but_keeps_irish_and_uk():
    assert eligible_location("Dublin, County Dublin")
    assert eligible_location("Ashbourne, County Meath")
    assert eligible_location("London, United Kingdom")
    assert eligible_location("Belfast, Northern Ireland")
    assert not eligible_location("Mumbai (On-site)")
    assert not eligible_location("Navi Mumbai (Hybrid)")
    assert not eligible_location("Bengaluru, India")
    assert not eligible_location("Remote")
    assert not eligible_location("Dubai, UAE")
