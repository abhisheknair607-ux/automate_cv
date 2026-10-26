"""Read-only audit of the actual Taaza 'Jobs' tab.

This module makes ONLY Google Sheets metadata and values.get calls. It never
writes sheets, deletes rows, changes preferences or triggers an importer.
Use --live explicitly; default mode accepts an offline JSON fixture.

For the shared personal workbook, WIF service account is attempted first;
only Google Sheets READONLY OAuth fallback is used if the service identity
isn't authorized. No Gmail permission or OpenAI API is required.
"""
from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from .job_dedupe import Job, analyze

SHEET_ID = os.getenv("TAAZA_SPREADSHEET_ID", "1jt3WXqpnzVOYcKCpABIp-7UMUPr48kVhMkLfzGEHHZY")
READ_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly"
HEADERS = ["Company Name", "Designation", "Link", "Job Description", "Location"]
MAX_ROWS = 10000
SAMPLE_CAP = 30


def get_sheets_clients():
    """Credentials are scoped to reading cells only; fail closed otherwise."""
    import google.auth
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build

    try:
        credentials, _ = google.auth.default(scopes=[READ_SCOPE])
        yield "workload_identity_readonly", build(
            "sheets", "v4", credentials=credentials, cache_discovery=False
        )
    except (OSError, ValueError) as exc:
        print(f"Workload identity credentials unavailable: {type(exc).__name__}")

    env = (
        "GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET",
        "GOOGLE_OAUTH_REFRESH_TOKEN",
    )
    if all(os.getenv(name) for name in env):
        credentials = Credentials(
            token=None,
            refresh_token=os.environ[env[2]],
            token_uri="https://oauth2.googleapis.com/token",
            client_id=os.environ[env[0]],
            client_secret=os.environ[env[1]],
            scopes=[READ_SCOPE],
        )
        yield "oauth_readonly", build(
            "sheets", "v4", credentials=credentials, cache_discovery=False
        )


def _read(client, name: str, area: str) -> list[list]:
    return client.spreadsheets().values().get(
        spreadsheetId=SHEET_ID,
        range=f"'{name}'!{area}",
    ).execute(num_retries=3).get("values", [])


def read_live_jobs(client) -> list[Job]:
    info = client.spreadsheets().get(
        spreadsheetId=SHEET_ID,
        fields="sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))",
    ).execute(num_retries=3)
    prop = next((s["properties"] for s in info.get("sheets", [])
                 if s.get("properties", {}).get("title") == "Jobs"), None)
    if not prop:
        raise RuntimeError("Expected master Jobs tab not found")
    cap = int(prop.get("gridProperties", {}).get("rowCount", 0))
    if cap < 2 or cap > MAX_ROWS:
        raise RuntimeError(f"Unexpected Jobs grid size {cap}; no rows read")
    header = _read(client, "Jobs", "A1:E1")
    if not header or header[0] != HEADERS:
        raise RuntimeError("Jobs header changed; refusing a potentially incorrect audit")
    data = _read(client, "Jobs", f"A2:E{cap}")
    jobs = []
    for rownum, row in enumerate(data, start=2):
        vals = list(row) + [""] * max(0, 5 - len(row))
        company, title, url, jd, location = (str(v or "").strip() for v in vals[:5])
        if not any((company, title, url, jd, location)):
            continue
        if not (company and title and url):
            # Display a bounded error rather than silently losing input rows.
            raise RuntimeError(f"Incomplete Jobs record at row {rownum}; review sheet manually")
        # JD does not participate in matching; it matters only for future
        # protected cleanup. The existing placeholder is not a real JD.
        has_jd = bool(jd and jd.casefold() not in {
            "open original job description", "job description missing",
            "paste job description",
        })
        jobs.append(Job("Jobs", rownum, company, title, location, url, has_jd=has_jd))
    return jobs


def _count_redundant_exact(matches) -> int:
    """Count independent exact-identity components, never fuzzy-chain groups."""
    parent = {}
    def root(x):
        parent.setdefault(x, x)
        while x != parent[x]:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    for pair in matches:
        a, b = root(pair.left), root(pair.right)
        if a != b:
            parent[b] = a
    components = {}
    for ref in parent:
        lead = root(ref)
        components[lead] = components.get(lead, 0) + 1
    return sum(size - 1 for size in components.values())


def summarize(jobs: list[Job]) -> dict:
    report = analyze(jobs)
    byref = {j.row_ref: j for j in jobs}
    groups = []
    for group in report.groups:
        member_jobs = [byref[key] for key in group]
        relevant = [m for m in report.exact_pairs + report.possible_pairs
                    if m.left in group and m.right in group]
        exact = any(m.kind.startswith("EXACT") for m in relevant)
        groups.append({
            "refs": group,
            "classification": "contains_exact" if exact else "possible_only",
            "pairs": len(relevant),
            # Short text summaries for optional local JSON review; not printed
            # to publicly accessible GitHub Actions logs.
            "titles": sorted({j.title for j in member_jobs}),
            "companies": sorted({j.company for j in member_jobs}),
            "urls": [j.url for j in member_jobs],
        })
    return {
        "checked_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "sheet": "Jobs",
        "records": report.records,
        "exact_pairs": len(report.exact_pairs),
        "possible_pairs": len(report.possible_pairs),
        "exact_groups": len([g for g in groups if g["classification"] == "contains_exact"]),
        "possible_only_groups": len([g for g in groups if g["classification"] == "possible_only"]),
        "redundant_exact_rows_upper_bound": _count_redundant_exact(report.exact_pairs),
        "groups": groups,
        "exact_matches": [vars(m) for m in report.exact_pairs],
        "possible_matches": [vars(m) for m in report.possible_pairs],
        "note": "Read-only candidate groups. No deletion is authorized or performed.",
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Taaza read-only duplicate audit")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--live", action="store_true", help="Read real Taaza using readonly Sheets API")
    mode.add_argument("--input", type=Path, help="Offline JSON array of Job keyword mappings")
    parser.add_argument("--output", type=Path, help="Optional LOCAL JSON report file")
    args = parser.parse_args(argv)

    if args.input:
        jobs = [Job(**x) for x in json.loads(args.input.read_text(encoding="utf-8"))]
        method = "local_fixture"
    else:
        jobs = None
        errors = []
        for method, client in get_sheets_clients():
            try:
                jobs = read_live_jobs(client)
                break
            except Exception as exc:
                errors.append(f"{method}: {type(exc).__name__}: {str(exc)[:150]}")
        if jobs is None:
            raise RuntimeError("Read-only Taaza access failed: " + " | ".join(errors))
    result = summarize(jobs)
    if args.output:
        args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n",
                               encoding="utf-8")
    # Do not log raw job URLs, JDs or applicant-specific data in public Actions.
    safe = {k: result[k] for k in (
        "checked_at_utc", "sheet", "records", "exact_pairs",
        "possible_pairs", "exact_groups", "possible_only_groups",
    )}
    safe.update({"auth": method, "writes": 0, "deletions": 0})
    print(json.dumps(safe, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
