"""Unit tests: no Gmail, LinkedIn, Google Sheets or paid API calls."""
from __future__ import annotations

from email import policy
from email.parser import BytesParser

import pytest

from automate_cv import linkedin_alert_import as li


def mail(subject="UK jobs", to="itsabhisheknnair@gmail.com",
         plain="", from_="LinkedIn <jobalerts-noreply@linkedin.com>",
         forwarded="", html=""):
    source = (f"From: {from_}\nTo: {to}\nSubject: {subject}\n"
              f"MIME-Version: 1.0\nContent-Type: text/plain; charset=utf-8\n\n"
              f"{plain}\n{forwarded}").encode()
    return BytesParser(policy=policy.default).parsebytes(source)


def job_html(id_="4428148635", title="Tax Manager - Associate",
             company="JPMorganChase", loc="Mumbai (On-site)"):
    return (f'<a href="https://www.linkedin.com/comm/jobs/view/{id_}'
            f'?trk=job_posting_digest"><div>{title}</div>'
            f'<div>{company} · {loc}</div><div>9 connections</div></a>')


@pytest.mark.parametrize("url, expected", [
    ("https://www.linkedin.com/comm/jobs/view/4428148635?trk=abc", "4428148635"),
    ("https://linkedin.com/jobs/view/4480972179/", "4480972179"),
    ("https://www.linkedin.com/jobs/view/4480972179/?trackingId=x", "4480972179"),
    ("https://evil-linkedin.com/jobs/view/4428148635", None),
    ("https://linkedin.com.evil.com/jobs/view/4428148635", None),
    ("https://www.linkedin.com/jobs/search?keywords=tax", None),
    ("javascript:alert(1)", None),
    ("https://www.linkedin.com/comm/jobs/view/invalid", None),
])
def test_link_only_verified_job_hosts(url, expected):
    assert li.job_id(url) == expected


def test_duplicate_logo_and_job_card_selects_details():
    src = (
        '<a href="https://www.linkedin.com/comm/jobs/view/4428148635">JPMorganChase</a>'
        + job_html()
        + '<a href="https://www.linkedin.com/jobs/search">See all jobs</a>'
        + job_html()
    )
    jobs, uncertain = li.parse_jobs(src)
    assert jobs == [li.Job("4428148635", "Tax Manager - Associate", "JPMorganChase",
                           "Mumbai (On-site)")]
    assert not uncertain


def test_multiple_cards_and_an_incomplete_card_flags_review():
    source = (job_html()
              + job_html("4480972179", "Associate Director Corporate Finance",
                         "Crowe Ireland", "Dublin 4, County Dublin, Ireland")
              + '<a href="https://linkedin.com/jobs/view/4555511111">A logo</a>')
    jobs, uncertain = li.parse_jobs(source)
    assert len(jobs) == 2
    assert uncertain
    assert jobs[1].location == "Dublin 4, County Dublin, Ireland"


def test_plaintext_digest_fallback():
    text = ("Your job alert for finance in Dublin\n\n"
            "Tax Manager - Associate\nJPMorganChase\nMumbai (On-site)\n"
            "9 connections\nView job: https://www.linkedin.com/comm/jobs/view/4428148635?trk=x\n")
    jobs, uncertain = li.parse_jobs("", text)
    assert jobs == [li.Job("4428148635", "Tax Manager - Associate",
                           "JPMorganChase", "Mumbai (On-site)")]
    assert not uncertain


def test_original_recipient_from_to_header_and_forwarded_body():
    assert li.original_owner(mail()) == "Abhishek"
    forwarded = "---------- Forwarded message ---------\nFrom: LinkedIn\nTo: Pooja <poojaktirupati@gmail.com>\n"
    assert li.original_owner(mail(to=li.INBOX, forwarded=forwarded)) == "Pooja"
    assert li.original_owner(mail(to=li.INBOX)) is None
    assert li.original_owner(mail(to="itsabhisheknnair@gmail.com, poojaktirupati@gmail.com")) is None


def test_setup_confirmation_even_with_job_links_is_skipped():
    subject = "Abhishek: your job alert for Financial Due Diligence in Ireland has been created"
    assert li.is_confirmation(subject, "")
    assert li.is_confirmation("random", "Your job alert has been created: Transfer Pricing")
    assert not li.is_confirmation("Tax Manager - Associate at JPMorganChase", "New jobs")


class Exec:
    def __init__(self, value): self.value = value

    def execute(self, **_kwargs): return self.value


class FakeSheets:
    def __init__(self):
        self.tabs = {
            li.INTAKE: [list(li.INTAKE_HEADERS)],
            li.LOG: [list(li.LOG_HEADERS)],
        }
        self.added = []

    def spreadsheets(self): return self

    def values(self): return self

    def get(self, **kwargs):
        a1 = kwargs.get("range", "")
        if a1.startswith("'Email Alerts'!"):
            val = self.tabs[li.INTAKE] if "A1:P1" in a1 else [[r[2]] for r in self.tabs[li.INTAKE][1:]]
        elif a1.startswith("'Email Import Log'!"):
            val = self.tabs[li.LOG] if "A1:K1" in a1 else [r[1:10] for r in self.tabs[li.LOG][1:]]
        elif a1.startswith("'Jobs'!C2:C"):
            val = [[url] for url in getattr(self, "master_urls", [])]
        else:
            raise AssertionError(a1)
        return Exec({"values": val})

    def append(self, **kwargs):
        tab = kwargs["range"].split("'")[1]
        for row in kwargs["body"]["values"]:
            self.tabs[tab].append(row)
        self.added.append(tab)
        return Exec({"updates": {"updatedRows": 1}})


class FakeGmail:
    def __init__(self, mails):
        self.mails = mails
        self.last_query = ""

    def users(self): return self

    def messages(self): return self

    def list(self, **kwargs):
        self.last_query = kwargs["q"]
        return Exec({"messages": [{"id": k} for k in self.mails]})

    def get(self, **kwargs):
        return Exec(self.mails[kwargs["id"]])


def raw_mail(headers: dict, html_body: str):
    import base64
    from email.message import EmailMessage
    msg = EmailMessage()
    for k, v in headers.items(): msg[k] = v
    msg.set_content("New jobs match your preferences")
    msg.add_alternative(html_body, subtype="html")
    return base64.urlsafe_b64encode(msg.as_bytes()).decode().rstrip("=")


def fake_digest(to="itsabhisheknnair@gmail.com", subject="Finance digest",
                html_body=None):
    return {"raw": raw_mail({
        "From": "LinkedIn <jobalerts-noreply@linkedin.com>",
        "To": to,
        "Date": "Mon, 26 Oct 2026 09:00:00 +0000",
        "Subject": subject,
    }, html_body if html_body is not None else job_html(loc="Dublin, County Dublin, Ireland")),
        "threadId": "thread-1"}


def with_fake_source_tabs(monkeypatch):
    # Use the same confirmed job tab schema; don't exercise or change the
    # production Taaza synchronizer as part of this importer test.
    monkeypatch.setattr("automate_cv.taaza_sync.discover_job_tabs",
                        lambda _sheets: [{"name": li.INTAKE}])


def test_preview_is_non_destructive(monkeypatch):
    with_fake_source_tabs(monkeypatch)
    sheets = FakeSheets()
    gmail = FakeGmail({"m1": fake_digest()})
    result = li.run(gmail, sheets, preview=True)
    assert result["added"] == 1
    assert result["preview"] is True
    assert sheets.added == []
    assert len(sheets.tabs[li.INTAKE]) == 1


def test_apply_and_rerun_is_idempotent(monkeypatch):
    with_fake_source_tabs(monkeypatch)
    sheets = FakeSheets()
    gmail = FakeGmail({"m1": fake_digest(), "m2": fake_digest(
        to="poojaktirupati@gmail.com",
        html_body=job_html("4499999999", "Wealth Adviser", "Davy", "Dublin, Ireland"))})
    first = li.run(gmail, sheets, preview=False)
    assert first["added"] == 2
    assert [r[13] for r in sheets.tabs[li.INTAKE][1:]] == ["Abhishek", "Pooja"]
    assert all(row[10] is False for row in sheets.tabs[li.INTAKE][1:])
    assert all(row[3] == "" for row in sheets.tabs[li.INTAKE][1:])
    assert li.run(gmail, sheets, preview=False)["added"] == 0
    assert len(sheets.tabs[li.LOG]) == 3
    assert len(sheets.tabs[li.INTAKE]) == 3


def test_unknown_recipient_review_never_imports(monkeypatch):
    with_fake_source_tabs(monkeypatch)
    sheets = FakeSheets()
    gmail = FakeGmail({"m": fake_digest(to=li.INBOX)})
    report = li.run(gmail, sheets, preview=False)
    assert report["review"] == 1
    assert len(sheets.tabs[li.INTAKE]) == 1
    assert sheets.tabs[li.LOG][1][9] == "Review"
    assert li.run(gmail, sheets, preview=False)["skipped"] == 1


def test_confirmation_skip_and_spoofed_sender(monkeypatch):
    with_fake_source_tabs(monkeypatch)
    sheets = FakeSheets()
    conf = fake_digest(subject="Your job alert for Analyst has been created")
    evil = fake_digest()
    import base64
    raw = base64.urlsafe_b64decode(evil["raw"] + "=" * (-len(evil["raw"]) % 4))
    raw = raw.replace(b"jobalerts-noreply@linkedin.com", b"fake@example.com")
    evil["raw"] = base64.urlsafe_b64encode(raw).decode().rstrip("=")
    gmail = FakeGmail({"c": conf, "e": evil})
    report = li.run(gmail, sheets, preview=False)
    assert report["confirmation"] == 1
    assert report["skipped"] == 1
    assert len(sheets.tabs[li.INTAKE]) == 1


def test_schema_change_fails_before_writing(monkeypatch):
    with_fake_source_tabs(monkeypatch)
    sheets = FakeSheets()
    sheets.tabs[li.INTAKE][0][2] = "Wrong URL heading"
    with pytest.raises(RuntimeError, match="headers changed"):
        li.run(FakeGmail({"m": fake_digest()}), sheets, preview=False)
    assert sheets.added == []


def test_indeed_mail_imports_into_existing_sheet_without_linkedin_column(monkeypatch):
    with_fake_source_tabs(monkeypatch)
    from test_job_alert_providers import email_sample
    from email.message import EmailMessage
    import base64

    msg = EmailMessage()
    msg["From"] = "Indeed <donotreply@jobalert.indeed.com>"
    msg["To"] = "itsabhisheknnair@gmail.com"
    msg["Subject"] = "Graduate Associate, M&A at Interpath Advisory. 13 more valuation jobs"
    msg.set_content(email_sample())
    gmail = FakeGmail({"indeed1": {
        "raw": base64.urlsafe_b64encode(msg.as_bytes()).decode().rstrip("="),
        "threadId": "i-thread",
    }})
    sheets = FakeSheets()
    result = li.run(gmail, sheets, preview=True)
    assert result["added"] == 3
    assert result["excluded_ads"] == 1
    assert result["samples"][0]["source"] == "Indeed"
    assert len(sheets.tabs[li.INTAKE]) == 1

    li.run(gmail, sheets, preview=False)
    jobs = sheets.tabs[li.INTAKE][1:]
    assert len(jobs) == 3
    assert all(job[12] == "Indeed Job Alert" for job in jobs)
    assert all(job[13] == "Abhishek" for job in jobs)
    assert all(job[15] == "" for job in jobs)
    assert all(job[10] is False for job in jobs)
    assert all("utm_" not in job[2] for job in jobs)
    assert li.run(gmail, sheets, preview=False)["added"] == 0


def test_indeed_unwanted_mumbai_is_filtered_without_write(monkeypatch):
    with_fake_source_tabs(monkeypatch)
    from email.message import EmailMessage
    import base64

    msg = EmailMessage()
    msg["From"] = "Indeed <donotreply@jobalert.indeed.com>"
    msg["To"] = "itsabhisheknnair@gmail.com"
    msg.set_content("Indeed Job Alert\n\nTax Manager - Associate\n"
                    "JPMorganChase - Mumbai (On-site)\n"
                    "Role information\n3 days ago\n"
                    "https://ie.indeed.com/rc/clk/dl?jk=0536af9cba329ebb")
    gmail = FakeGmail({"m": {
        "raw": base64.urlsafe_b64encode(msg.as_bytes()).decode().rstrip("="),
        "threadId": "i-thread",
    }})
    sheets = FakeSheets()
    result = li.run(gmail, sheets, preview=False)
    assert result["filtered"] == 1
    assert result["added"] == 0
    assert sheets.tabs[li.LOG][1][9] == "Filtered"
    assert len(sheets.tabs[li.INTAKE]) == 1


def test_review_uses_exact_25_oct_dublin_local_window(monkeypatch):
    from datetime import datetime, timedelta
    from zoneinfo import ZoneInfo
    with_fake_source_tabs(monkeypatch)
    gmail = FakeGmail({"m1": fake_digest()})
    sheets = FakeSheets()
    result = li.run(gmail, sheets, preview=True, on_date="2026-10-25")
    start = datetime(2026, 10, 25, tzinfo=ZoneInfo("Europe/Dublin"))
    end = datetime(2026, 10, 26, tzinfo=ZoneInfo("Europe/Dublin"))
    assert int(end.timestamp()) - int(start.timestamp()) == 25 * 3600
    assert f"after:{int(start.timestamp())}" in gmail.last_query
    assert f"before:{int(end.timestamp())}" in gmail.last_query
    assert result["preview"] is True
    assert sheets.added == []


def test_alert_skips_job_already_present_only_in_master(monkeypatch):
    """A vacancy unique to the Jobs tab must not be reimported."""
    with_fake_source_tabs(monkeypatch)
    sheets = FakeSheets()
    sheets.master_urls = [
        "https://ie.linkedin.com/jobs/view/4428148635/?trackingId=abc"
    ]
    gmail = FakeGmail({"m": fake_digest()})
    preview = li.run(gmail, sheets, preview=True)
    assert preview["added"] == 0
    assert preview["duplicates"] == 1
    assert sheets.added == []
    applied = li.run(gmail, sheets, preview=False)
    assert applied["added"] == 0
    assert len(sheets.tabs[li.INTAKE]) == 1


def test_importer_same_role_different_requisition_not_exact(monkeypatch):
    with_fake_source_tabs(monkeypatch)
    sheets = FakeSheets()
    sheets.master_urls = ["https://www.linkedin.com/jobs/view/4428148636/"]
    gmail = FakeGmail({"m": fake_digest()})
    result = li.run(gmail, sheets, preview=True)
    assert result["added"] == 1
    assert result["duplicates"] == 0


def test_importer_missing_master_authorization_is_not_ignored(monkeypatch):
    with_fake_source_tabs(monkeypatch)
    sheets = FakeSheets()
    original = sheets.get
    def broken_get(**kwargs):
        if "'Jobs'!C2:C" in kwargs.get("range", ""):
            raise RuntimeError("master Jobs permissions missing")
        return original(**kwargs)
    monkeypatch.setattr(sheets, "get", broken_get)
    with pytest.raises(RuntimeError, match="master Jobs"):
        li.run(FakeGmail({"m": fake_digest()}), sheets, preview=False)
    assert sheets.added == []
