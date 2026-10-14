"""Keep Taaza 'Jobs' the superset of its specialist regional job tabs.

Runs independently of opening the Apps Script dashboard. Does not modify the
source tabs, existing Jobs rows, CV status or the CV generation workflow.
"""
from __future__ import annotations

import os
import re
from urllib.parse import parse_qsl, urlencode, urlsplit

import google.auth
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

SHEET_ID = os.getenv("TAAZA_SPREADSHEET_ID", "1jt3WXqpnzVOYcKCpABIp-7UMUPr48kVhMkLfzGEHHZY")
MASTER = "Jobs"
REGIONAL = ("TP Europe", "Pooja Europe", "Europe")
SCOPES = ("https://www.googleapis.com/auth/spreadsheets",)
DROP_QUERY = re.compile(r"^(utm_.+|fbclid|gclid|msclkid|igshid|ref_src|source|trk|tracking|tm_event|tm_company)$", re.I)


def canonical(value):
    """Match the existing Apps Script job URL canonicalization."""
    raw = str(value or "").strip().split("#", 1)[0]
    try:
        parsed = urlsplit(raw)
        if parsed.scheme.lower() not in ("http", "https") or not parsed.netloc:
            return ""
        domain = parsed.netloc.lower().removeprefix("www.")
        path = parsed.path.rstrip("/") or "/"
        params = sorted((k, v) for k, v in parse_qsl(parsed.query, keep_blank_values=True)
                        if not DROP_QUERY.match(k))
        return "https://" + domain + path + ("?" + urlencode(params) if params else "")
    except ValueError:
        return ""


def candidates(master_rows, regional_rows):
    """Build only genuinely new master records, with stable origin tracking."""
    seen = {canonical(row[2]) for row in master_rows if len(row) > 2 and canonical(row[2])}
    additions = []
    counts = {}
    for tab, rows in regional_rows.items():
        added = 0
        for values in rows:
            row = list(values) + [""] * max(0, 13 - len(values))
            link = canonical(row[2])
            if not link or link in seen or not str(row[0]).strip() or not str(row[1]).strip():
                continue
            seen.add(link)
            # K can dispatch an existing scraper-to-Freshmaal transfer.
            # The mirror must never initiate a CV transfer or request.
            # L is retained for reference; M records source tab.
            additions.append(list(row[:10]) + [False, row[11], tab])
            added += 1
        counts[tab] = added
    return additions, counts


def oauth_credentials():
    required = ("GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_OAUTH_REFRESH_TOKEN")
    if not all(os.getenv(k) for k in required):
        return None
    return Credentials(
        token=None,
        refresh_token=os.environ["GOOGLE_OAUTH_REFRESH_TOKEN"],
        token_uri="https://oauth2.googleapis.com/token",
        client_id=os.environ["GOOGLE_OAUTH_CLIENT_ID"],
        client_secret=os.environ["GOOGLE_OAUTH_CLIENT_SECRET"],
        scopes=list(SCOPES),
    )


def google_services():
    """Try the established short-lived GitHub WIF identity first.

    An OAuth user fallback is available when the service account has not been
    shared on the Taaza spreadsheet. Never print secrets or tokens.
    """
    creds, _ = google.auth.default(scopes=list(SCOPES))
    yield "workload_identity", build("sheets", "v4", credentials=creds, cache_discovery=False)
    oauth = oauth_credentials()
    if oauth:
        yield "oauth_fallback", build("sheets", "v4", credentials=oauth, cache_discovery=False)


def get_values(sheets, name, start=2, end=None):
    quoted = "'" + name.replace("'", "''") + "'"
    rng = f"{quoted}!A{start}:M{end}" if end else f"{quoted}!A{start}:M"
    result = sheets.spreadsheets().values().get(spreadsheetId=SHEET_ID, range=rng).execute()
    return result.get("values", [])


def tabs_and_dimensions(sheets):
    response = sheets.spreadsheets().get(
        spreadsheetId=SHEET_ID,
        fields="sheets(properties(title,gridProperties(rowCount)))",
    ).execute()
    return {entry["properties"]["title"]: entry["properties"]["gridProperties"]["rowCount"]
            for entry in response.get("sheets", [])}


def _occupied(row):
    """Ignore pre-filled false checkboxes in K; protect all substantive data."""
    return any(str(row[i] if i < len(row) else "").strip() not in ("", "None")
               for i in list(range(10)) + [11, 12])


def sync_once(sheets):
    dimensions = tabs_and_dimensions(sheets)
    if MASTER not in dimensions:
        raise RuntimeError("Taaza master Jobs tab not found. No spreadsheet changes made.")
    tabs = [t for t in REGIONAL if t in dimensions]
    # Avoid any dependence on alert or setup tabs.
    master_rows = get_values(sheets, MASTER)
    sources = {tab: get_values(sheets, tab) for tab in tabs}
    additions, counts = candidates(master_rows, sources)
    if not additions:
        return {"added": 0, "by_source": counts, "master_row": None}

    # Re-read shortly before the write to catch a job added concurrently.
    fresh = get_values(sheets, MASTER)
    additions, counts = candidates(fresh, sources)
    if not additions:
        return {"added": 0, "by_source": counts, "master_row": None}

    occupied = [i + 2 for i, row in enumerate(fresh) if any(str(v).strip() for v in row[:3])]
    first = (max(occupied) + 1) if occupied else 2
    last = first + len(additions) - 1
    # Never overwrite an unexpected existing entry, even if its A-C are blank.
    target = get_values(sheets, MASTER, first, min(last, dimensions[MASTER]))
    if any(_occupied(row) for row in target):
        raise RuntimeError("Jobs destination contains other data; refusing to overwrite. Retry after review.")

    if last > dimensions[MASTER]:
        sheets.spreadsheets().batchUpdate(
            spreadsheetId=SHEET_ID,
            body={"requests": [{"appendDimension": {
                "sheetId": _sheet_id(sheets, MASTER),
                "dimension": "ROWS",
                "length": last - dimensions[MASTER],
            }}]},
        ).execute()

    sheets.spreadsheets().values().update(
        spreadsheetId=SHEET_ID,
        range=f"'{MASTER}'!A{first}:M{last}",
        valueInputOption="RAW",
        body={"values": additions},
    ).execute()

    # Verify the new rows actually arrived before announcing success.
    written = get_values(sheets, MASTER, first, last)
    if len(written) != len(additions) or any(
        canonical(row[2] if len(row) > 2 else "") != canonical(values[2])
        for row, values in zip(written, additions)
    ):
        raise RuntimeError("Taaza master write verification failed; review Jobs before retry.")
    return {"added": len(additions), "by_source": counts, "master_row": first}


def _sheet_id(sheets, name):
    data = sheets.spreadsheets().get(
        spreadsheetId=SHEET_ID,
        fields="sheets(properties(sheetId,title))",
    ).execute()
    for entry in data.get("sheets", []):
        if entry["properties"]["title"] == name:
            return entry["properties"]["sheetId"]
    raise RuntimeError("Master sheet ID unavailable.")


def main():
    errors = []
    for auth_type, sheets in google_services():
        try:
            outcome = sync_once(sheets)
            print(f"[taaza] auth={auth_type}; new_master_jobs={outcome['added']}; "
                  f"per_tab={outcome['by_source']}; starting_row={outcome['master_row']}")
            return
        except HttpError as exc:
            code = getattr(exc.resp, "status", None)
            if code in (401, 403) and auth_type == "workload_identity":
                print("[taaza] WIF identity cannot access Taaza; trying authorised user OAuth.")
                errors.append("WIF access denied")
                continue
            raise RuntimeError(f"Taaza sync failed: Google Sheets HTTP {code}") from None
    raise RuntimeError("Taaza master sync cannot authenticate. " + "; ".join(errors))


if __name__ == "__main__":
    main()
