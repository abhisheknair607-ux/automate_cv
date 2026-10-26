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
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from email import policy
from email.parser import BytesParser
from email.utils import parseaddr, parsedate_to_datetime
from html.parser import HTMLParser
from urllib.parse import urlsplit

from .job_alert_providers import (
    AlertJob, parse_indeed, provider_for,
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


def plausible_title(title: str) -> bool:
    """Reject email boilerplate mistakenly extracted as job titles."""
    title = str(title or "").strip()
    if len(title) < 3 or len(title) > 250:
        return False
    if re.fullmatch(r"[-–—_=*#•.\s]+", title):
        return False
    if re.search(r"^(?:\d+\s+)?(?:new\s+)?jobs?\s+matches?\b", title, re.I):
        return False
    if re.search(r"^(?:your\s+job\s+alert|view\s+job|see\s+(?:all\s+)?jobs)\b", title, re.I):
        return False
    return True


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
    if (not plausible_title(title) or not company or title.casefold() == company.casefold()
            or len(company) > 200):
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
            if (plausible_title(title) and company and title != company
                    and len(company) <= 200):
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
    """Global exact keys across master and all supported Taaza intake tabs.

    This must include MASTER Jobs: a vacancy already in master may not exist
    in any regional tab. Missing headers/permissions fail closed rather than
    skipping the dedupe check.
    """
    from .taaza_sync import discover_job_tabs, exact_job_key, MASTER
    # A readable column C is not enough: a renamed or shifted master column
    # could silently bypass duplicate detection and admit repeated jobs.
    headers = sheet_values(sheets, f"'{MASTER}'!A1:C1")
    if headers != [["Company Name", "Designation", "Link"]]:
        raise RuntimeError("master Jobs headers missing or changed; importer stopped without writing")
    found = set()
    all_names = [MASTER, *(tab["name"] for tab in discover_job_tabs(sheets))]
    for tab in dict.fromkeys(all_names):
        title = tab.replace("'", "''")
        for row in sheet_values(sheets, f"'{title}'!C2:C"):
            if row:
                key = exact_job_key(str(row[0]))
                if key:
                    found.add(key)
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



def linked_job_ids(html_body: str, plain_body: str = "") -> set[str]:
    """Identify genuine LinkedIn job-view links even when card text is incomplete."""
    p = LinkTextParser()
    p.feed(html_body or "")
    found = {key for url, _ in p.links if (key := job_id(url))}
    for url in re.findall(r"https?://[^\s<>\"']+", plain_body or ""):
        key = job_id(url.rstrip(").,;>"))
        if key:
            found.add(key)
    return found


def list_all_messages(gmail, query: str, max_messages: int) -> list[dict]:
    """Fetch EVERY Gmail page; fail rather than silently dropping a truncated window."""
    found = []
    token = None
    seen = set()
    while True:
        batch = gmail.users().messages().list(
            userId="me", q=query, maxResults=min(500, max_messages),
            **({"pageToken": token} if token else {}),
        ).execute(num_retries=3)
        for message in batch.get("messages", []):
            if message["id"] not in seen:
                seen.add(message["id"])
                found.append(message)
        token = batch.get("nextPageToken")
        if not token:
            return found
        if len(found) >= max_messages:
            raise RuntimeError(
                f"Gmail query exceeded {max_messages} messages. No import was started; "
                "split the calendar range into smaller periods."
            )


def mail_window(*, days: int, on_date: str | None,
                start_date: str | None, end_date: str | None) -> str:
    """Dublin-local inclusive dates, respecting the October DST boundary."""
    if on_date and (start_date or end_date):
        raise ValueError("Use either --on-date or --start-date and --end-date")
    if bool(start_date) != bool(end_date):
        raise ValueError("Select both start and end dates")
    if on_date:
        start_date = end_date = on_date
    if start_date and end_date:
        first = datetime.strptime(start_date, "%Y-%m-%d").date()
        last = datetime.strptime(end_date, "%Y-%m-%d").date()
        if first > last or (last - first).days > 89:
            raise ValueError("Date range must be ordered and at most 90 days inclusive")
        tz = ZoneInfo("Europe/Dublin")
        start = datetime.combine(first, datetime.min.time(), tz)
        end = datetime.combine(last + timedelta(days=1), datetime.min.time(), tz)
        return f"after:{int(start.timestamp())} before:{int(end.timestamp())}"
    return f"newer_than:{days}d"


def run(gmail, sheets, *, preview: bool, days: int = 7,
        max_messages: int = 10000, retry_review: bool = True,
        on_date: str | None = None, start_date: str | None = None,
        end_date: str | None = None) -> dict:
    """Import per vacancy; never discard sound jobs because a sibling card failed."""
    check_headers(sheets)
    from .taaza_sync import exact_job_key
    states = logged_states(sheets)
    existing = known_job_ids(sheets)
    window = mail_window(days=days, on_date=on_date,
                         start_date=start_date, end_date=end_date)
    search = (f"{{from:{SENDER} from:donotreply@jobalert.indeed.com "
              f"from:irishjobs.ie from:jobs.ie}} {window} "
              "-in:spam -in:trash")
    messages = list_all_messages(gmail, search, max_messages)
    counters = {"found": 0, "added": 0, "duplicates": 0, "review": 0,
                "review_jobs": 0, "skipped": 0, "confirmation": 0,
                "messages": 0, "totalListed": len(messages), "filtered": 0,
                "excluded_ads": 0, "preview": preview,
                "samples": [], "review_reasons": []}
    for item in messages:
        id_ = item["id"]
        last = states.get(id_, "")
        # Review and legacy Filtered records are reconsidered automatically.
        if last in ("Processed", "Confirmation", "Non-job") or (
                last in ("Review", "Partial") and not retry_review):
            counters["skipped"] += 1
            continue
        resource = gmail.users().messages().get(
            userId="me", id=id_, format="raw").execute(num_retries=3)
        message = decode_message(resource["raw"])
        provider, parser_ready = provider_for(str(message.get("From", "")))
        if provider is None:
            counters["skipped"] += 1
            continue
        subject = str(message.get("Subject", ""))[:250]
        plain = extract_part(message, "plain")
        owner = original_owner(message) or "Shared"
        parsed = []
        pending = []
        result = "Review"
        details = ""
        excluded_ads = 0
        if provider == "LinkedIn" and is_confirmation(subject, plain):
            counters["confirmation"] += 1
            result = "Confirmation"
            details = "Alert setup confirmation — no vacancy"
        elif not parser_ready:
            details = f"{provider} template not yet verified; needs manual review"
        else:
            if provider == "LinkedIn":
                html_body = extract_part(message, "html")
                jobs, suspicious = parse_jobs(html_body, plain)
                candidates = [AlertJob(
                    provider="LinkedIn", external_id=j.id, title=j.title,
                    company=j.company, location=j.location, url=j.url,
                ) for j in jobs]
                # A verified LinkedIn job ID remains a real vacancy even when
                # the email template does not reveal its title/company.
                missing_ids = linked_job_ids(html_body, plain) - {j.id for j in jobs}
                pending = [AlertJob(
                    provider="LinkedIn", external_id=key,
                    title=f"Review LinkedIn vacancy #{key}",
                    company="Employer to verify", location="",
                    url=f"https://www.linkedin.com/jobs/view/{key}/",
                ) for key in sorted(missing_ids)]
            elif provider == "Indeed":
                candidates, suspicious, excluded_ads = parse_indeed(plain)
            else:
                candidates, suspicious = [], True
            parsed = candidates
            counters["excluded_ads"] += excluded_ads
            if pending or suspicious:
                result = "Partial" if parsed or pending else "Review"
                details = f"{len(pending)} LinkedIn job links need details; parser incomplete"
            elif parsed:
                result = "Processed"
                details = "Job cards extracted; location is retained for user filtering"
            else:
                details = "No confidently parsed job cards; inspect original email"
        counters["messages"] += 1
        counters["found"] += len(parsed) + len(pending)
        if result in ("Review", "Partial"):
            counters["review"] += 1
            counters["review_jobs"] += len(pending)
            if len(counters["review_reasons"]) < 8:
                counters["review_reasons"].append(details)
        added = duplicates = 0
        for job, needs_review in [(j, False) for j in parsed] + [(j, True) for j in pending]:
            exact = exact_job_key(job.url)
            if not exact:
                raise RuntimeError("Unverifiable job URL; stopped before write")
            if exact in existing:
                duplicates += 1
                continue
            existing.add(exact)
            added += 1
            if len(counters["samples"]) < 12:
                counters["samples"].append({
                    "source": provider, "owner": owner, "company": job.company,
                    "title": job.title, "location": job.location,
                    "job_id": job.external_id,
                    "status": "Needs Review" if needs_review else result,
                })
            if not preview:
                append_row(sheets, INTAKE, [
                    job.company, job.title, job.url, "",
                    job.location, "", "", "",
                    datetime.now(timezone.utc).date().isoformat(),
                    job.salary, False, "",
                    provider + (" Job Alert · Needs Review" if needs_review else " Job Alert"),
                    owner, id_, job.external_id if provider == "LinkedIn" else "",
                ])
        counters["added"] += added
        counters["duplicates"] += duplicates
        if not preview:
            now = datetime.now(timezone.utc).isoformat(timespec="seconds")
            append_row(sheets, LOG, [
                now, id_, resource.get("threadId", ""), _date(message), subject,
                owner, len(parsed) + len(pending), added, duplicates, result,
                provider + ": " + details,
            ])
    return counters


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Shared Gmail LinkedIn job alert to Taaza importer")
    ap.add_argument("--apply", action="store_true", help="Write to Email Alerts and Email Import Log")
    ap.add_argument("--days", type=int, default=7)
    ap.add_argument("--max-messages", type=int, default=10000)
    ap.add_argument("--retry-review", action="store_true")
    ap.add_argument("--on-date", help="Legacy single Dublin-local date (YYYY-MM-DD)")
    ap.add_argument("--start-date", help="First Dublin-local alert date (YYYY-MM-DD)")
    ap.add_argument("--end-date", help="Final Dublin-local alert date, inclusive (YYYY-MM-DD)")
    args = ap.parse_args(argv)
    try:
        mail_window(days=args.days, on_date=args.on_date,
                    start_date=args.start_date, end_date=args.end_date)
    except ValueError as exc:
        ap.error(str(exc))
    if args.apply and os.environ.get("GARAMAAL_ALERT_IMPORT_APPROVED") != "true":
        ap.error("Importer writes are locked: explicit parser approval gate is not enabled")
    if not 1 <= args.days <= 90 or not 1 <= args.max_messages <= 10000:
        ap.error("days must be 1..90, max-messages must be 1..10000")
    gmail = gmail_service()
    errors = []
    for kind, sheets in sheet_service():
        try:
            result = run(gmail, sheets, preview=not args.apply, days=args.days,
                         max_messages=args.max_messages, retry_review=args.retry_review,
                         on_date=args.on_date, start_date=args.start_date,
                         end_date=args.end_date)
            print(json.dumps({"sheets_auth": kind, **result}, sort_keys=True))
            return 0
        except Exception as exc:
            errors.append(kind + ": " + str(exc))
    print("Import failed (no CV workflow affected): " + " | ".join(errors), file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
