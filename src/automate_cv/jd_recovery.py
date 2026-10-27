"""Conservative public-employer JD recovery for Garamaal's Discovery queue.

Dry-run unless BOTH --apply and GARAMAAL_JD_RECOVERY_APPROVED=true.
No LLM, LinkedIn scraping, CV generation, duplicate deletion, or JD invention.
Requires the existing Google Sheets WIF/OAuth setup, and writes only verified
Taaza D/L plus Freshmaal A:D and AG for safe new vacancies.
"""
from __future__ import annotations

import argparse
import html
import ipaddress
import json
import os
import re
import socket
from dataclasses import dataclass
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit

import httpx

from .taaza_sync import canonical, exact_job_key, google_services

TAAZA_ID = os.getenv("TAAZA_SPREADSHEET_ID", "1jt3WXqpnzVOYcKCpABIp-7UMUPr48kVhMkLfzGEHHZY")
FRESH_ID = os.getenv("FRESHMAL_SPREADSHEET_ID", "1ltT1gPFcpBdz1Wp_CuxkwFpfkwnnhjL316yVu3gxPCc")
MISSING = {"", "open original job description", "click here", "view job description",
           "see original job description", "job description missing"}
SECTIONS = (
    r"\b(?:responsibilities|what you(?:'|’)ll do|what you will do|your impact|key duties|"
    r"the opportunity|your role|your responsibilities)\b",
    r"\b(?:requirements|qualifications|what we(?:'|’)re looking for|you will bring|"
    r"what you bring|skills and experience|essential criteria|candidate profile)\b",
)
ROLE_WORDS = {"senior", "junior", "associate", "analyst", "the", "and", "for", "of", "a",
              "in", "to", "executive", "consultant", "specialist"}
MAX_BODY = 1_000_000


class JDHTML(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style", "noscript", "svg", "nav", "footer", "header"}:
            self.skip += 1
        if not self.skip and tag in {"p", "br", "div", "li", "h1", "h2", "h3", "h4", "section", "tr"}:
            self.parts.append("\n")
        if not self.skip and tag == "li":
            self.parts.append("- ")

    def handle_endtag(self, tag):
        if tag in {"script", "style", "noscript", "svg", "nav", "footer", "header"} and self.skip:
            self.skip -= 1
        if not self.skip and tag in {"p", "div", "li", "section", "tr"}:
            self.parts.append("\n")

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)


def plain(markup: str) -> str:
    reader = JDHTML()
    reader.feed(html.unescape(markup or ""))
    value = "".join(reader.parts).replace("\xa0", " ")
    return "\n".join(x.strip() for x in value.splitlines() if x.strip()).strip()


def is_missing(value: str) -> bool:
    return str(value or "").strip().casefold() in MISSING


def is_full_jd(value: str) -> bool:
    """Strict structural gate: search snippets and job-card summaries must fail."""
    text = str(value or "").strip()
    if len(text) < 650 or len(text) > 100_000 or is_missing(text):
        return False
    if re.search(r"\b(?:job has expired|position has been filled|no longer accepting applications)\b",
                 text[:1500], re.I):
        return False
    return all(re.search(pattern, text, re.I) for pattern in SECTIONS)


def title_match(wanted: str, found: str) -> bool:
    def words(s):
        return {x for x in re.findall(r"[a-z0-9]+", str(s).lower())
                if len(x) >= 3 and x not in ROLE_WORDS}
    a, b = words(wanted), words(found)
    return bool(a and b and len(a & b) / len(a) >= .7)


def public_https(url: str) -> str:
    parsed = urlsplit(url)
    host = (parsed.hostname or "").lower().rstrip(".")
    if parsed.scheme != "https" or not host or parsed.username or parsed.password or parsed.port not in (None, 443):
        raise ValueError("Not a permitted public HTTPS vacancy address")
    if host == "localhost" or host.endswith((".local", ".internal", ".localhost")):
        raise ValueError("Local hostname blocked")
    # Resolve all A/AAAA results: no private, loopback, link-local or metadata IPs.
    for item in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM):
        address = ipaddress.ip_address(item[4][0])
        if not address.is_global:
            raise ValueError("Non-public destination blocked")
    return url


def get_public(client: httpx.Client, url: str) -> httpx.Response:
    for _ in range(4):
        public_https(url)
        response = client.get(url, follow_redirects=False, timeout=12.0)
        if response.status_code in (301, 302, 303, 307, 308):
            next_url = urljoin(url, response.headers.get("location", ""))
            if next_url == url:
                raise ValueError("Redirect loop")
            url = next_url
            continue
        response.raise_for_status()
        if len(response.content) > MAX_BODY:
            raise ValueError("Oversize public job page")
        return response
    raise ValueError("Excessive redirects")


def jsonld_postings(markup: str):
    for snippet in re.findall(
        r'<script[^>]*type=["\x27]application/ld\+json["\x27][^>]*>(.*?)</script>',
        markup, re.I | re.S):
        try:
            payload = json.loads(html.unescape(snippet))
        except (ValueError, TypeError):
            continue
        pending = [payload]
        while pending:
            obj = pending.pop()
            if isinstance(obj, list):
                pending.extend(obj)
            elif isinstance(obj, dict):
                if "JobPosting" in str(obj.get("@type", "")):
                    yield obj
                pending.extend(obj.get("@graph", []) if isinstance(obj.get("@graph"), list) else [])


@dataclass(frozen=True)
class Recovered:
    text: str
    source: str
    title: str


def extract_page(markup: str, title: str, url: str) -> Recovered | None:
    for obj in jsonld_postings(markup):
        if not title_match(title, str(obj.get("title", ""))):
            continue
        body = plain(str(obj.get("description", "")))
        if is_full_jd(body):
            return Recovered(body, url, str(obj.get("title", "")))
    return None  # No guessing from header/footer/SEO summaries.


def fetch_jd(client: httpx.Client, url: str, title: str) -> Recovered | None:
    parsed = urlsplit(url)
    host, parts = (parsed.hostname or "").lower(), parsed.path.strip("/").split("/")
    if "linkedin.com" in host:
        return None  # Public LinkedIn summaries do not constitute a complete employer JD.
    endpoints = []
    if host in {"job-boards.greenhouse.io", "boards.greenhouse.io"} and len(parts) >= 3 and parts[-2] == "jobs":
        board, job = parts[0], parts[-1]
        if re.fullmatch(r"\d{5,15}", job) and re.fullmatch(r"[\w-]{2,80}", board):
            endpoints.append(("greenhouse", f"https://boards-api.greenhouse.io/v1/boards/{board}/jobs/{job}?content=true"))
    if host == "jobs.lever.co" and len(parts) >= 2:
        board, job = parts[0], parts[1]
        if re.fullmatch(r"[\w-]{2,80}", board) and re.fullmatch(r"[\w-]{12,80}", job):
            endpoints.append(("lever", f"https://api.lever.co/v0/postings/{board}/{job}"))
    if host == "jobs.ashbyhq.com" and len(parts) >= 2 and re.fullmatch(r"[\w-]{2,80}", parts[0]):
        endpoints.append(("ashby", f"https://api.ashbyhq.com/posting-api/job-board/{parts[0]}"))
    if host == "jobs.smartrecruiters.com" and len(parts) >= 2 and re.fullmatch(r"[\w-]+", parts[0]):
        ident = parts[1].split("-")[0]
        if re.fullmatch(r"\d{6,20}", ident):
            endpoints.append(("smartrecruiters", f"https://api.smartrecruiters.com/v1/companies/{parts[0]}/postings/{ident}"))

    for vendor, endpoint in endpoints:
        try:
            data = get_public(client, endpoint).json()
            recovered = None
            matched_title = ""
            if vendor == "greenhouse":
                matched_title = str(data.get("title", ""))
                recovered = plain(str(data.get("content", "")))
            elif vendor == "lever":
                matched_title = str(data.get("text", ""))
                blocks = [data.get("descriptionPlain", ""), data.get("description", "")]
                blocks.extend(x.get("content", "") for x in data.get("lists", []) if isinstance(x, dict))
                blocks.append(data.get("additionalPlain", "") or data.get("additional", ""))
                recovered = plain("\n".join(str(x or "") for x in blocks if x))
            elif vendor == "ashby":
                target = parts[1].lower()
                for entry in data.get("jobs", []):
                    if str(entry.get("id", "")).lower() == target or str(entry.get("jobId", "")).lower() == target:
                        matched_title = str(entry.get("title", ""))
                        recovered = plain(str(entry.get("descriptionHtml") or entry.get("descriptionPlain") or ""))
                        break
            elif vendor == "smartrecruiters":
                matched_title = str(data.get("name", ""))
                sections = data.get("jobAd", {}).get("sections", {})
                recovered = plain("\n".join(str(item.get("text", "")) for item in sections.values()
                                            if isinstance(item, dict)))
            if recovered and title_match(title, matched_title) and is_full_jd(recovered):
                return Recovered(recovered, url, matched_title)
        except (httpx.HTTPError, ValueError, OSError, TypeError, KeyError):
            pass  # Try the employer-hosted canonical vacancy page next.

    try:
        response = get_public(client, url)
        return extract_page(response.text, title, str(response.url))
    except (httpx.HTTPError, ValueError, OSError):
        return None


def priority(row: list) -> int:
    title = str(row[1] if len(row) > 1 else "").lower()
    location = str(row[4] if len(row) > 4 else "").lower()
    good = [
        r"transfer pricing|intercompany",
        r"corporate finance|transactions?|valuation|m&a|deals",
        r"fp&a|financial analy|commercial finance|finance business",
        r"financial advis|wealth|financial plan|investment analy|portfolio analy|private credit",
    ]
    score = max([35 for pat in good if re.search(pat, title)] or [0])
    if re.search(r"analyst|associate|consultant|executive|adviser|advisor|paraplann", title):
        score += 12
    if re.search(r"director|head of|chief |vice president|senior manager|internship", title):
        score -= 20
    if re.search(r"ireland|dublin|cork|galway|london|uk|united kingdom", location):
        score += 8
    return score


def sheet_values(service, spreadsheet_id: str, range_name: str):
    return service.spreadsheets().values().get(spreadsheetId=spreadsheet_id,
                                               range=range_name).execute(num_retries=2).get("values", [])


def safe_fresh_row(fresh_rows: list[list]) -> int:
    for index, values in enumerate(fresh_rows, start=3):
        v = list(values) + [""] * (58 - len(values))
        # Match legacy openSlot_: no vacancy in A:D and no workflow M:AF.
        # Reject residual CV/CL/selection controls in E:L to prevent reuse of active records.
        if not any(str(x).strip() for x in v[:12]) and not any(str(x).strip() for x in v[12:32]):
            return index
    raise RuntimeError("No unused Freshmaal row available; no changes written")


def prepare(rows: list[list], limit: int):
    choices = []
    seen = set()
    for idx, row in enumerate(rows, start=2):
        a = list(row) + [""] * (17 - len(row))
        if not a[0] or not a[1] or not a[2] or not is_missing(a[3]):
            continue
        if str(a[16]).strip() == "Dup" or (str(a[13]).strip() == "Not Interested" and
                                           str(a[14]).strip() == "Not Interested"):
            continue
        key = exact_job_key(str(a[2]))
        if not key or key in seen:
            continue
        seen.add(key)
        choices.append((idx, a))
    choices.sort(key=lambda item: (-priority(item[1]), item[0]))
    return choices[:limit]


def put(service, spreadsheet_id, changes):
    service.spreadsheets().values().batchUpdate(
        spreadsheetId=spreadsheet_id,
        body={"valueInputOption": "RAW", "data": changes},
    ).execute(num_retries=1)


def apply_recovered(service, idx: int, old: list, recovered: Recovered, fresh_snapshot: list[list]):
    """Best-effort idempotent two-sheet handoff; fail closed on stale or active rows."""
    current = sheet_values(service, TAAZA_ID, f"'Jobs'!A{idx}:Q{idx}")
    if not current:
        raise RuntimeError("Discovery row disappeared")
    live = current[0] + [""] * (17 - len(current[0]))
    if live[:3] != old[:3] or not is_missing(live[3]):
        raise RuntimeError("Discovery was edited; refuse recovery overwrite")
    key = exact_job_key(old[2])
    hits = [(i, row) for i, row in enumerate(fresh_snapshot, start=3)
            if len(row) >= 3 and exact_job_key(str(row[2])) == key]
    if len(hits) > 1:
        raise RuntimeError("Duplicate Freshmaal identities; manual review required")
    if hits:
        row_num, existing = hits[0]
        existing_jd = str(existing[3] if len(existing) > 3 else "")
        if existing_jd and existing_jd != recovered.text:
            raise RuntimeError("Existing Make CV JD differs; do not overwrite")
    else:
        row_num = safe_fresh_row(fresh_snapshot)
        latest = sheet_values(service, FRESH_ID, f"'Sheet1'!A{row_num}:AF{row_num}")
        if latest and any(str(x).strip() for x in latest[0][:32]):
            raise RuntimeError("Free Make CV row became occupied")
        put(service, FRESH_ID, [
            {"range": f"'Sheet1'!A{row_num}:D{row_num}",
             "values": [[old[0], old[1], old[2], recovered.text]]},
            {"range": f"'Sheet1'!AG{row_num}",
             "values": [[old[4]]]},
        ])
        verification = sheet_values(service, FRESH_ID, f"'Sheet1'!A{row_num}:D{row_num}")
        if not verification or verification[0][:4] != [old[0], old[1], old[2], recovered.text]:
            raise RuntimeError("Make CV verification failed; Discovery unchanged")
        fresh_snapshot[row_num - 3] = [old[0], old[1], old[2], recovered.text]
    info = f"Automatic JD — Freshmaal row {row_num} — {urlsplit(recovered.source).hostname}"
    put(service, TAAZA_ID, [
        {"range": f"'Jobs'!D{idx}", "values": [[recovered.text]]},
        {"range": f"'Jobs'!L{idx}", "values": [[info]]},
    ])
    readback = sheet_values(service, TAAZA_ID, f"'Jobs'!D{idx}:L{idx}")
    if not readback or readback[0][0] != recovered.text or readback[0][8] != info:
        raise RuntimeError("Discovery readback failed; inspect before retry")
    return row_num


def run(service, *, apply: bool, limit: int):
    rows = sheet_values(service, TAAZA_ID, "'Jobs'!A2:Q1000")
    fresh = sheet_values(service, FRESH_ID, "'Sheet1'!A3:BF1000")
    if not rows or not fresh:
        raise RuntimeError("Expected populated Discovery and Make CV sheets")
    results = []
    with httpx.Client(headers={"User-Agent": "Garamaal-JD-Recovery/1.0 (public employer pages only)"},
                      trust_env=False) as client:
        for idx, row in prepare(rows, limit):
            url = str(row[2])
            item = {"row": idx, "company": str(row[0]), "role": str(row[1]),
                    "source": url, "outcome": "Needs JD"}
            if "linkedin.com" in (urlsplit(url).hostname or "").lower():
                item["reason"] = "LinkedIn: verify official employer source manually"
            else:
                recovered = fetch_jd(client, url, str(row[1]))
                if not recovered:
                    item["reason"] = "No complete verified employer/ATS description"
                elif not apply:
                    item.update(outcome="Automatic JD candidate (preview only)",
                                recovered_chars=len(recovered.text), source=recovered.source)
                else:
                    try:
                        fresh_row = apply_recovered(service, idx, row, recovered, fresh)
                        item.update(outcome="Automatic JD", make_cv_row=fresh_row,
                                    recovered_chars=len(recovered.text), source=recovered.source)
                    except Exception as error:
                        item["reason"] = f"Write verification blocked: {str(error)[:180]}"
            results.append(item)
    return {"mode": "APPLY" if apply else "READ-ONLY PREVIEW", "inspected": len(results),
            "complete": sum(x["outcome"].startswith("Automatic JD") for x in results),
            "rows": results}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Write verified JDs ONLY when server-side gate enabled")
    parser.add_argument("--limit", type=int, default=20)
    args = parser.parse_args()
    if not 1 <= args.limit <= 50:
        parser.error("--limit must be between 1 and 50")
    if args.apply and os.getenv("GARAMAAL_JD_RECOVERY_APPROVED") != "true":
        parser.error("GARAMAAL_JD_RECOVERY_APPROVED=true is required for writes")
    errors = []
    for auth_name, service in google_services():
        try:
            result = run(service, apply=args.apply, limit=args.limit)
            print(json.dumps(result, indent=2, ensure_ascii=False))
            return
        except Exception as error:
            errors.append(f"{auth_name}: {type(error).__name__}: {str(error)[:180]}")
    raise RuntimeError("JD recovery could not complete: " + " | ".join(errors))


if __name__ == "__main__":
    main()
