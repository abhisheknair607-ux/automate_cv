"""Read-only JD recovery safety checks (no real network or Sheets writes)."""
import json
from types import SimpleNamespace

import pytest

from automate_cv import jd_recovery as jd


def sample_description():
    return (
        "<h2>The opportunity</h2><p>Work with our finance team on forecasting, budgeting, "
        "client profitability and stakeholder reporting. " + "Analyse multi-year forecasts and results. " * 12 +
        "</p><h2>Key Responsibilities</h2><ul><li>Develop financial models, "
        "review business assumptions and prepare monthly reports.</li>" * 5 +
        "</ul><h2>Qualifications</h2><p>Qualified accountant, advanced Excel, "
        "three years of financial planning and analysis experience preferred.</p>" * 4
    )


def test_only_complete_structured_descriptions_qualify():
    full = jd.plain(sample_description())
    assert jd.is_full_jd(full)
    assert not jd.is_full_jd("Open original job description")
    assert not jd.is_full_jd(("Financial analyst Dublin. " * 40).strip())
    assert not jd.is_full_jd("Responsibilities: strong Excel skills " * 32)


def test_jsonld_preserves_original_description_and_checks_vacancy_title():
    markup = '<script type="application/ld+json">' + json.dumps({
        "@type": "JobPosting", "title": "Senior FP&A Analyst",
        "description": sample_description(),
    }) + "</script>"
    recovered = jd.extract_page(markup, "Senior FP&A Analyst", "https://jobs.example.com/job/abc")
    assert recovered and "Key Responsibilities" in recovered.text
    assert recovered.source == "https://jobs.example.com/job/abc"
    assert jd.extract_page(markup, "Mortgage Adviser", "https://jobs.example.com/job/abc") is None


def test_rank_before_recovery_without_deleting_uninteresting_rows():
    def row(role, link, *, jd_text="", duplicate="", status_a="", status_p=""):
        value = ["Company", role, link, jd_text, "Dublin"] + [""] * 8
        value += [status_a, status_p, "", duplicate]
        return value
    rows = [
        row("Head of Cyber Security", "https://example.com/h"),
        row("Transfer Pricing Senior Associate", "https://example.com/tp"),
        row("Transfer Pricing Senior Associate", "https://example.com/tp"),  # same original vacancy
        row("FP&A Analyst", "https://example.com/fp", duplicate="Dup"),
        row("Portfolio Analyst", "https://example.com/pa",
            status_a="Not Interested", status_p="Not Interested"),
        row("Wealth Management Associate", "https://example.com/w", jd_text="Open original job description"),
        row("Finance Analyst", "https://example.com/complete", jd_text=jd.plain(sample_description())),
    ]
    selected = jd.prepare(rows, 20)
    assert [i for i, _ in selected] == [3, 7, 2]


def test_prefilled_false_checkboxes_are_not_active_jobs():
    empty = ["", "", "", ""] + [False] * 6 + [""] * 22
    occupied = ["Employer", "Analyst", "https://example.com/job", jd.plain(sample_description())]
    assert jd.safe_fresh_row([occupied, empty]) == 4
    with pytest.raises(RuntimeError, match="No unused"):
        jd.safe_fresh_row([occupied])


def test_linkedin_never_pretends_public_summary_is_a_full_jd():
    class FailNetwork:
        def get(self, *_args, **_kwargs):
            raise AssertionError("LinkedIn must not be fetched")
    assert jd.fetch_jd(FailNetwork(), "https://www.linkedin.com/jobs/view/1234567890/", "Analyst") is None


def test_greenhouse_vendor_checks_title_and_structural_content(monkeypatch):
    calls = []
    def fake_get(_client, url):
        calls.append(url)
        return SimpleNamespace(json=lambda: {
            "title": "Senior FP&A Analyst", "content": sample_description()
        }, text="", url=url)
    monkeypatch.setattr(jd, "get_public", fake_get)
    recovered = jd.fetch_jd(None, "https://job-boards.greenhouse.io/acme/jobs/8239518", "Senior FP&A Analyst")
    assert recovered and jd.is_full_jd(recovered.text)
    assert "boards-api.greenhouse.io" in calls[0]
    assert jd.fetch_jd(None, "https://job-boards.greenhouse.io/acme/jobs/8239518", "Transfer Pricing Adviser") is None


def test_stale_discovery_edit_blocks_writes(monkeypatch):
    row = ["Company", "FP&A Analyst", "https://example.com/j", "", "Dublin"] + [""] * 12
    monkeypatch.setattr(jd, "sheet_values", lambda *_: [[
        "Company", "FP&A Analyst", "https://example.com/j", "manually edited"
    ]])
    def no_writes(*_args):
        raise AssertionError("No writes allowed when Discovery changed")
    monkeypatch.setattr(jd, "put", no_writes)
    recovered = jd.Recovered(jd.plain(sample_description()), "https://example.com/j", "FP&A Analyst")
    with pytest.raises(RuntimeError, match="Discovery was edited"):
        jd.apply_recovered(None, 2, row, recovered, [])
