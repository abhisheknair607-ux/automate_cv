"""Read LinkedIn alert mail from the shared Gmail inbox into Taaza's Email Alerts tab.

Separate opt-in integration: no LinkedIn scraping, job ranking, CV generation or
changes to the master Jobs sheet. GitHub WIF/OAuth Sheets auth is reused, while
Gmail explicitly requires the shared mailbox's own OAuth refresh token.
"""
from __future__ import annotations

import argparse
import base64
import html
import json
import os
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from email import policy
from email.parser import BytesParser
from email.utils import parseaddr, parsedate_to_datetime
from html.parser import HTMLParser
from urllib.parse import urlsplit

from .job_alert_providers import (
    AlertJob, eligible_location, indeed_job_key, parse_indeed, provider_for,
)

SHEET_ID = os.getenv("TAAZA_SPREADSHEET_ID", "1jt3WXqpnzVOYcKCpABIp-7UMUPr48kVhMkLfzGEHHZY")
INBOX = "abhisheknair607@gmail.com"
SENDER = "jobalerts-noreply@linkedin.com"
INTAKE = "Email Alerts"
LOG = "Email Import Log"
OWNERS = {
    "itsabhisheknnair@gmail.com": "Abhishek",
    "poojaktirupati@gmail.com": "Pooja",
}
INTAKE_HEADERS = [
    "Company Name", "Designation", "Link", "Job Description", "Location",
    "Posted Date", "Application End Date", "Role Start Date", "Date Added",
    "Salary & Visa Sponsorship", "Send to CV Sheet", "CV Sheet Status",
    "Discovery Source", "Alert Owner", "Gmail Message ID", "LinkedIn Job ID",
]
LOG_HEADERS = [
    "Processed At", "Gmail Message ID", "Gmail Thread ID", "Alert Received At",
    "Subject", "Alert Owner", "Jobs Found", "Jobs Added", "Duplicates Skipped",
    "Result", "Details",
]
JOB_LINK = re.compile(r"/(?:comm/)?jobs/view/(\d{7,15})(?:/|$)", re.I)
EMAILS = re.compile(r"(?<![\w.+-])(?:itsabhisheknnair|poojaktirupati)@gmail\.com(?![\w.-])", re.I)
STOP = re.compile(
    r"\b(?:Premium|Actively recruiting|Fast growing|\d[\d,]*\s+(?:connections?|company alumni))\b",
    re.I,
)
BLOCK_TAGS = {"br", "div", "p", "li", "td", "tr", "h1", "h2", "h3"}


@dataclass(frozen=True)
class Job:
    id: str
    title: str
    company: str
    location: str = ""

    @property
    def url(self) -> str:
        return f"https://www.linkedin.com/jobs/view/{self.id}/"


class LinkTextParser(HTMLParser):
    """Keep text belonging to each HTML anchor, including nested tags."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links: list[tuple[str, str]] = []
        self._href: str | None = None
        self._text: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            # A new anchor closes a malformed previous one rather than merging jobs.
            if self._href is not None:
                self._finish()
            self._href = dict(attrs).get("href") or ""
            self._text = []
        elif self._href is not None and tag in BLOCK_TAGS:
            self._text.append("\n")

    def handle_endtag(self, tag):
        if tag == "a" and self._href is not None:
            self._finish()
        elif self._href is not None and tag in BLOCK_TAGS:
            self._text.append("\n")

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def _finish(self):
        self.links.append((self._href or "", "".join(self._text)))
        self._href = None
        self._text = []


def job_id(url: str) -> str | None:
    """Accept only HTTPS/HTTP LinkedIn job view URLs, never lookalike hosts."""
    url = html.unescape(str(url or "").strip())
    try:
        parts = urlsplit(url)
    except ValueError:
        return None
    if parts.scheme not in ("https", "http") or (parts.hostname or "").lower() not in (
        "linkedin.com", "www.linkedin.com"
    ):
        return None
    found = JOB_LINK.match(parts.path)
    return found.group(1) if found else None


def clean_lines(value: str) -> list[str]:
    return [line for line in (re.sub(r"\s+", " ", s).strip() for s in value.splitlines()) if line]


def trim_location(value: str) -> str:
    value = STOP.split(value, 1)[0].strip(" ·|–-")
    # LinkedIn's social proof follows the country/workplace tag in some digests.
    match = re.search(r"\((?:On-site|Hybrid|Remote)\)", value, re.I)
    if match:
        return value[:match.end()].strip()
    match = re.search(r"\b(?:Ireland|United Kingdom|India|United States)\b", value, re.I)
    if match:
        return value[:match.end()].strip()
    return value[:180].strip()


def parse_job_text(id_: str, content: str) -> Job | None:
    lines = clean_lines(content)
    if len(lines) < 2:
        return None
    # Prefer the first "Company · Location" line, not social-proof text.
    detail = next((i for i, line in enumerate(lines) if "·" in line and i > 0), -1)
    if detail < 1:
        return None
    title = lines[0].strip()
    company, location = (s.strip() for s in lines[detail].split("·", 1))
    location = trim_location(location)
    if (not title or not company or title.casefold() == company.casefold()
            or len(title) > 250 or len(company) > 200
            or title.lower() in {"view job", "see jobs", "jobs"}):
        return None
    return Job(id_, title, company, location)


def parse_jobs(html_body: str, plain_body: str = "") -> tuple[list[Job], bool]:
    """Return valid jobs and whether suspicious/unparsed job links need review."""
    parser = LinkTextParser()
    parser.feed(html_body or "")
    best: dict[str, tuple[int, Job]] = {}
    suspicious = False
    seen_ids = set()
    for url, anchor_text in parser.links:
        id_ = job_id(url)
        if not id_:
            continue
        seen_ids.add(id_)
        job = parse_job_text(id_, anchor_text)
        if job is None:
            continue
        score = (10 if "job_posting" in url.lower() else 0) + len(clean_lines(anchor_text))
        if id_ not in best or score > best[id_][0]:
            best[id_] = (score, job)

    # LinkedIn's plaintext MIME often gives title, company, location, then
    # "View job: URL"; recover cards if email HTML differs or is absent.
    if plain_body:
        lines = [line.strip() for line in plain_body.splitlines()]
        for pos, line in enumerate(lines):
            if not line.lower().startswith("view job:"):
                continue
            match = re.search(r"https?://\S+", line)
            id_ = job_id(match.group(0).rstrip(").,") if match else "")
            if not id_:
                continue
            seen_ids.add(id_)
            if id_ in best:
                continue
            # Unrelated social proof may be interleaved; identify the last
            # contiguous triplet before the job link (role, company, city).
            block = [x for x in lines[max(0, pos - 12):pos] if x]
            if len(block) < 3:
                continue
            # Usually the role/company/location are the first three lines
            # after the preceding "View job" marker or digest introduction.
            marker = next(
                (i for i in range(len(block) - 1, -1, -1)
                 if block[i].lower().startswith(("view job:", "new jobs match", "your job alert"))),
                -1,
            )
            section = block[marker + 1:]
            if len(section) < 3:
                continue
            title, company, location = section[:3]
            if (title and company and title != company and len(title) <= 250
                    and len(company) <= 200 and not title.lower().startswith("your job alert")):
                best[id_] = (0, Job(id_, title, company, trim_location(location)))
    suspicious = bool(seen_ids - best.keys())
    return [pair[1] for pair in best.values()], suspicious


def original_owner(message) -> str | None:
    """Fail closed on ambiguous forwarded mail; never assume the shared To owner."""
    found: set[str] = set()
    # Original RFC822 To may survive Gmail auto-forwarding. Forwarding headers
    # differ among Gmail versions; inspect them but do not use Delivered-To.
    for header in ("To", "Cc", "X-Original-To", "X-Forwarded-For", "Original-Recipient"):
        found.update(OWNERS[a.lower()] for a in EMAILS.findall(str(message.get(header, ""))))
    # Manual forwarding retains original "To:" inside the forwarded message.
    body = extract_part(message, "plain") or ""
    for line in body.splitlines():
        if re.match(r"^\s*(?:To|Original To|X-Forwarded-For):", line, re.I):
            found.update(OWNERS[a.lower()] for a in EMAILS.findall(line))
    return next(iter(found)) if len(found) == 1 else None


def extract_part(message, subtype: str) -> str:
    for part in message.walk():
        if part.get_content_maintype() == "text" and part.get_content_subtype() == subtype:
            if part.get_content_disposition() == "attachment":
                continue
            try:
                return part.get_content()
            except (UnicodeError, LookupError):
                continue
    return ""


def is_confirmation(subject: str, body: str) -> bool:
    return bool(re.search(r"job alert.{0,120}(?:has been created|was created)", subject, re.I)
                or re.search(r"your job alert has been created:", body[:1500], re.I))


def decode_message(raw: str):
    return BytesParser(policy=policy.default).parsebytes(
        base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4))
    )


def check_headers(sheets) -> None:
    for tab, expected in ((INTAKE, INTAKE_HEADERS), (LOG, LOG_HEADERS)):
        got = sheet_values(sheets, f"'{tab}'!A1:{'P' if tab == INTAKE else 'K'}1")
        if not got or got[0] != expected:
            raise RuntimeError(f"{tab} missing or headers changed; importer stopped without writing")


def sheet_values(sheets, rng: str) -> list[list]:
    return sheets.spreadsheets().values().get(spreadsheetId=SHEET_ID, range=rng).execute(
        num_retries=3
    ).get("values", [])


def append_row(sheets, tab: str, row: list) -> None:
    sheets.spreadsheets().values().append(
        spreadsheetId=SHEET_ID, range=f"'{tab}'!A1",
        valueInputOption="RAW", insertDataOption="INSERT_ROWS",
        body={"values": [row]},
    ).execute(num_retries=3)


def known_job_ids(sheets) -> set[str]:
    """Deduplicate by source+stable ID against every verified job-source tab."""
    from .taaza_sync import discover_job_tabs
    found = set()
    for tab in discover_job_tabs(sheets):
        title = tab["name"].replace("'", "''")
        for row in sheet_values(sheets, f"'{title}'!C2:C"):
            if not row:
                continue
            url = str(row[0])
            li_id = job_id(url)
            indeed_id = indeed_job_key(url)
            if li_id:
                found.add("linkedin:" + li_id)
            if indeed_id:
                found.add("indeed:" + indeed_id)
    return found


def logged_states(sheets) -> dict[str, str]:
    states = {}
    for row in sheet_values(sheets, f"'{LOG}'!B2:J"):
        # B:J -> id at 0, state/result J at index 8.
        if len(row) >= 9 and row[0]:
            states[str(row[0])] = str(row[8])
    return states


def gmail_service():
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build
    names = ("LINKEDIN_GMAIL_CLIENT_ID", "LINKEDIN_GMAIL_CLIENT_SECRET",
             "LINKEDIN_GMAIL_REFRESH_TOKEN")
    missing = [key for key in names if not os.getenv(key)]
    if missing:
        raise RuntimeError("Shared Gmail OAuth credentials missing: " + ", ".join(missing))
    creds = Credentials(
        token=None, refresh_token=os.environ[names[2]],
        token_uri="https://oauth2.googleapis.com/token",
        client_id=os.environ[names[0]], client_secret=os.environ[names[1]],
        scopes=["https://www.googleapis.com/auth/gmail.readonly"],
    )
    return build("gmail", "v1", credentials=creds, cache_discovery=False)


def sheet_service():
    # Identical authentication order to the established Taaza mirror workflow.
    from .taaza_sync import google_services
    return google_services()


def _date(message) -> str:
    try:
        return parsedate_to_datetime(str(message.get("Date"))).astimezone(
            timezone.utc).isoformat(timespec="seconds")
    except (ValueError, TypeError, OverflowError):
        return ""


def run(gmail, sheets, *, preview: bool, days: int = 7,
        max_messages: int = 100, retry_review: bool = False) -> dict:
    """Import one Gmail message at a time; safe to rerun after partial writes."""
    check_headers(sheets)  # also ensures permission before processing email
    states = logged_states(sheets)
    existing = known_job_ids(sheets)
    search = (f"{{from:{SENDER} from:donotreply@jobalert.indeed.com "
              f"from:irishjobs.ie from:jobs.ie}} newer_than:{days}d "
              "-in:spam -in:trash")
    listing = gmail.users().messages().list(
        userId="me", q=search, maxResults=max_messages).execute(num_retries=3)
    counters = {"found": 0, "added": 0, "duplicates": 0, "review": 0, "skipped": 0,
                "confirmation": 0, "messages": 0, "filtered": 0, "excluded_ads": 0,
                "preview": preview, "samples": [], "review_reasons": []}
    for item in listing.get("messages", []):
        id_ = item["id"]
        last = states.get(id_, "")
        if last in ("Processed", "Confirmation", "Filtered") or (last == "Review" and not retry_review):
            counters["skipped"] += 1
            continue
        resource = gmail.users().messages().get(
            userId="me", id=id_, format="raw").execute(num_retries=3)
        message = decode_message(resource["raw"])
        # Gmail query is discovery only: check the original RFC822 From address.
        provider, parser_ready = provider_for(str(message.get("From", "")))
        if provider is None:
            counters["skipped"] += 1
            continue
        subject = str(message.get("Subject", ""))[:250]
        plain = extract_part(message, "plain")
        parsed = []
        owner = original_owner(message)
        result = "Review"
        details = ""
        if provider == "LinkedIn" and is_confirmation(subject, plain):
            counters["confirmation"] += 1
            result = "Confirmation"
            details = "LinkedIn alert-creation notification, not an ordinary digest"
        elif not parser_ready:
            details = f"{provider} parser pending a real reviewed example; no rows imported"
        else:
            if provider == "LinkedIn":
                jobs, suspicious = parse_jobs(extract_part(message, "html"), plain)
                candidates = [AlertJob(
                    provider="LinkedIn", external_id=j.id, title=j.title,
                    company=j.company, location=j.location, url=j.url,
                ) for j in jobs]
                excluded_ads = 0
            elif provider == "Indeed":
                candidates, suspicious, excluded_ads = parse_indeed(plain)
            else:
                candidates, suspicious, excluded_ads = [], True, 0
            # Reject all overseas/unknown-location jobs, including Mumbai.
            # Do not silently turn a region in the email subject into a job location.
            parsed = [j for j in candidates if eligible_location(j.location)]
            excluded_location = len(candidates) - len(parsed)
            counters["filtered"] += excluded_location
            counters["excluded_ads"] += excluded_ads
            if owner is None:
                details = "Original recipient unknown or ambiguous; no rows imported"
            elif suspicious:
                details = "Some job cards incomplete or unverified; no rows imported"
            elif not candidates:
                details = "No confidently parsed job cards; inspect original Gmail MIME"
            elif not parsed:
                result = "Filtered"
                details = f"All {excluded_location} extracted job(s) outside approved Ireland/UK locations"
            else:
                result = "Processed"
                details = f"{excluded_location} outside Ireland/UK; {excluded_ads} ads without stable link excluded"
        counters["messages"] += 1
        counters["found"] += len(parsed)
        if len(counters["samples"]) < 12:
            for job in parsed[:12 - len(counters["samples"])]:
                counters["samples"].append({"source": provider,
                                            "owner": owner or "Unassigned",
                                            "company": job.company, "title": job.title,
                                            "location": job.location,
                                            "job_id": job.external_id,
                                            "status": result})
        if result == "Review":
            counters["review"] += 1
            if len(counters["review_reasons"]) < 8:
                counters["review_reasons"].append(details)
        added = duplicates = 0
        # Only commit validated complete messages with confirmed candidate ownership.
        if result == "Processed":
            for job in parsed:
                if job.key in existing:
                    duplicates += 1
                    continue
                existing.add(job.key)
                added += 1
                if not preview:
                    append_row(sheets, INTAKE, [
                        job.company, job.title, job.url, "",
                        job.location, "", "", "",
                        datetime.now(timezone.utc).date().isoformat(),
                        job.salary, False, "", provider + " Job Alert", owner, id_,
                        job.external_id if provider == "LinkedIn" else "",
                    ])
        counters["added"] += added
        counters["duplicates"] += duplicates
        if not preview:
            now = datetime.now(timezone.utc).isoformat(timespec="seconds")
            append_row(sheets, LOG, [
                now, id_, resource.get("threadId", ""), _date(message), subject,
                owner or "Unassigned", len(parsed), added, duplicates, result,
                provider + ": " + details,
            ])
        # In preview, keep deduplication across messages without mutating Sheets.
    return counters


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Shared Gmail LinkedIn job alert to Taaza importer")
    ap.add_argument("--apply", action="store_true", help="Write to Email Alerts and Email Import Log")
    ap.add_argument("--days", type=int, default=7)
    ap.add_argument("--max-messages", type=int, default=100)
    ap.add_argument("--retry-review", action="store_true")
    args = ap.parse_args(argv)
    if not 1 <= args.days <= 90 or not 1 <= args.max_messages <= 500:
        ap.error("days must be 1..90, max-messages must be 1..500")
    gmail = gmail_service()
    errors = []
    for kind, sheets in sheet_service():
        try:
            result = run(gmail, sheets, preview=not args.apply, days=args.days,
                         max_messages=args.max_messages, retry_review=args.retry_review)
            print(json.dumps({"sheets_auth": kind, **result}, sort_keys=True))
            return 0
        except Exception as exc:
            errors.append(kind + ": " + str(exc))
    print("Import failed (no CV workflow affected): " + " | ".join(errors), file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
