"""Lossless-alert safeguards: no live Gmail, Sheets or paid API requests."""
from datetime import datetime
from zoneinfo import ZoneInfo
import pytest
from automate_cv import linkedin_alert_import as li
from test_linkedin_alert_import import (
    FakeGmail, FakeSheets, Exec, fake_digest, job_html, with_fake_source_tabs,
)


def test_partial_email_keeps_valid_cards_and_link_only_review_cards(monkeypatch):
    with_fake_source_tabs(monkeypatch)
    html = (job_html("4490000001", "Associate", "Davy", "Dublin")
            + '<a href="https://linkedin.com/jobs/view/4490000002/">See vacancy</a>')
    sheets = FakeSheets()
    gmail = FakeGmail({"digest": fake_digest(html_body=html)})
    first = li.run(gmail, sheets, preview=False)
    assert first["added"] == 2
    assert first["review"] == 1
    assert first["review_jobs"] == 1
    assert sheets.tabs[li.INTAKE][1][1] == "Associate"
    assert sheets.tabs[li.INTAKE][2][0] == "Employer to verify"
    assert sheets.tabs[li.INTAKE][2][12].endswith("Needs Review")
    assert sheets.tabs[li.LOG][1][9] == "Partial"
    # Partial emails retry by default; canonical IDs prevent additional rows.
    rerun = li.run(gmail, sheets, preview=False)
    assert rerun["added"] == 0
    assert len(sheets.tabs[li.INTAKE]) == 3


def test_calendar_range_is_inclusive_across_dublin_dst(monkeypatch):
    with_fake_source_tabs(monkeypatch)
    sheets = FakeSheets()
    gmail = FakeGmail({"m": fake_digest()})
    li.run(gmail, sheets, preview=True,
           start_date="2026-10-24", end_date="2026-10-26")
    tz = ZoneInfo("Europe/Dublin")
    assert "after:" + str(int(datetime(2026, 10, 24, tzinfo=tz).timestamp())) in gmail.last_query
    assert "before:" + str(int(datetime(2026, 10, 27, tzinfo=tz).timestamp())) in gmail.last_query
    assert sheets.added == []


@pytest.mark.parametrize("first,last", [
    ("2026-10-26", "2026-10-24"),
    ("2026-02-30", "2026-03-01"),
    ("2026-06-01", "2026-10-26"),
])
def test_invalid_ranges_are_rejected_before_any_gmail_access(first,last,monkeypatch):
    with_fake_source_tabs(monkeypatch)
    gmail = FakeGmail({})
    with pytest.raises(ValueError):
        li.run(gmail, FakeSheets(), preview=True, start_date=first, end_date=last)
    assert gmail.last_query == ""


def test_gmail_pagination_reads_every_result_and_does_not_silently_truncate(monkeypatch):
    with_fake_source_tabs(monkeypatch)
    class Pages(FakeGmail):
        def list(self, **kwargs):
            self.last_query = kwargs["q"]
            if kwargs.get("pageToken"):
                return Exec({"messages": [{"id": "m2"}]})
            return Exec({"messages": [{"id": "m1"}], "nextPageToken": "next"})
    gmail = Pages({"m1": fake_digest(),
                   "m2": fake_digest(html_body=job_html(
                       "4490000003","Financial Adviser","Davy","Dublin"))})
    preview = li.run(gmail, FakeSheets(), preview=True)
    assert preview["totalListed"] == 2
    assert preview["added"] == 2
    with pytest.raises(RuntimeError,match="split the calendar range"):
        li.run(gmail, FakeSheets(), preview=False, max_messages=1)


def test_import_distinguishes_exact_duplicates_from_different_requisitions(monkeypatch):
    with_fake_source_tabs(monkeypatch)
    first = job_html("4490000001", "Analyst", "EY", "London")
    second = job_html("4490000002", "Analyst", "EY", "London")
    sheets = FakeSheets()
    reports = li.run(FakeGmail({"m":fake_digest(html_body=first+second)}),
                     sheets, preview=False)
    assert reports["added"] == 2
    assert reports["duplicates"] == 0

def test_review_origin_survives_master_mirror_without_touching_existing_jobs():
    from automate_cv.taaza_sync import candidates
    normal = ["EY", "Analyst", "https://linkedin.com/jobs/view/4490000001/",
              "", "Dublin", "", "", "", "", "", False, "", "LinkedIn Job Alert"]
    review = ["Employer to verify", "Review LinkedIn vacancy #4490000002",
              "https://linkedin.com/jobs/view/4490000002/",
              "", "", "", "", "", "", "", False, "",
              "LinkedIn Job Alert · Needs Review"]
    additions,counts = candidates([], {"Email Alerts":[normal,review]})
    assert counts["Email Alerts"] == 2
    assert additions[0][12] == "Email Alerts"
    assert additions[1][12] == "Email Alerts · Needs Review"
    assert additions[1][10] is False
