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

from .job_dedupe import identity

SHEET_ID = os.getenv("TAAZA_SPREADSHEET_ID", "1jt3WXqpnzVOYcKCpABIp-7UMUPr48kVhMkLfzGEHHZY")
MASTER = "Jobs"
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


def exact_job_key(url):
    """One exact vacancy identity across master, regional and alert tabs.

    Verified LinkedIn/Indeed IDs survive cross-domain tracking links.
    All other providers use full normalized URLs, *not* fuzzy titles,
    ensuring distinct requisitions remain distinct.
    """
    kind, value = identity(url)
    if value:
        return kind + ":" + value
    return canonical(url)


def is_job_tab_header(row):
    """Detect job tabs by column schema, never by name.

    This deliberately excludes alert, dashboard, instructions and setup tabs.
    New job tabs must retain A=Company, B=Designation, C=Link headers.
    """
    values = [str(v or "").strip().lower() for v in (list(row) + ["", "", ""])[:3]]
    return (
        values[0] in ("company name", "company", "employer")
        and values[1] in ("designation", "job title", "role", "position", "title")
        and values[2] in ("link", "job link", "vacancy link", "url", "job url")
    )


def discover_job_tabs(sheets, master=MASTER):
    """Read all live spreadsheet tabs. Renaming keeps its stable sheet ID."""
    result = sheets.spreadsheets().get(
        spreadsheetId=SHEET_ID,
        fields="sheets(properties(sheetId,title,hidden,gridProperties(rowCount)))",
    ).execute()
    all_tabs = []
    for entry in result.get("sheets", []):
        props = entry["properties"]
        name = props["title"]
        if props.get("hidden") or name == master:
            continue
        header = get_values(sheets, name, 1, 1)
        if header and is_job_tab_header(header[0]):
            all_tabs.append({"id": str(props["sheetId"]), "name": name})
    return all_tabs


def candidates(master_rows, regional_rows):
    """Build only genuinely new master records, with stable origin tracking."""
    seen = {exact_job_key(row[2]) for row in master_rows
            if len(row) > 2 and exact_job_key(row[2])}
    additions = []
    counts = {}
    for tab, rows in regional_rows.items():
        added = 0
        for values in rows:
            row = list(values) + [""] * max(0, 13 - len(values))
            link = exact_job_key(row[2])
            if not link or link in seen or not str(row[0]).strip() or not str(row[1]).strip():
                continue
            seen.add(link)
            # K can dispatch an existing scraper-to-Freshmaal transfer.
            # The mirror must never initiate a CV transfer or request.
            # L is retained for reference; M records source tab.
            # Preserve an explicit review flag without losing the Email Alerts provenance.
            origin = (tab + " · Needs Review"
                      if tab == "Email Alerts" and "Needs Review" in str(row[12])
                      else tab)
            additions.append(list(row[:10]) + [False, row[11], origin])
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
        fields="sheets(properties(sheetId,title,gridProperties(rowCount)))",
    ).execute()
    return {entry["properties"]["title"]: entry["properties"]["gridProperties"]["rowCount"]
            for entry in response.get("sheets", [])}


def _occupied(row):
    """Ignore pre-filled false checkboxes in K; protect all substantive data."""
    return any(str(row[i] if i < len(row) else "").strip() not in ("", "None")
               for i in list(range(10)) + [11, 12])


CATEGORY_COL = "P"
CATEGORY_SEPARATOR = " | "


def category_assignments(master_rows, regional_rows):
    """Return per-row membership, including combinations and Common jobs.

    A vacancy belongs to each specialist tab where its canonical URL occurs.
    Membership derives from live tabs, never from its historical source in M.
    """
    memberships = {}
    for name, rows in regional_rows.items():
        for values in rows:
            if len(values) < 3:
                continue
            key = canonical(values[2])
            if key:
                parts = memberships.setdefault(key, [])
                if name not in parts:
                    parts.append(name)
    labels = []
    for row in master_rows:
        key = canonical(row[2]) if len(row) > 2 else ""
        if not key or not str(row[0]).strip():
            labels.append("")
        else:
            labels.append(CATEGORY_SEPARATOR.join(memberships.get(key, ["Common"])))
    choices = list(dict.fromkeys(["Common", *regional_rows.keys(), *(v for v in labels if v)]))
    return labels, choices


def sync_categories(sheets, master_rows, sources, row_capacity):
    """Refresh Jobs!P as an automatically verified, dropdown-backed category.

    P stores all matching categories as a single dropdown option for shared
    vacancies, e.g. 'TP Europe | Pooja Europe'. Column N/O decisions and the
    master data in A:M are never modified by this function.
    """
    labels, options = category_assignments(master_rows, sources)
    count = len(labels)
    existing_data = sheets.spreadsheets().values().get(
        spreadsheetId=SHEET_ID,
        range=f"'{MASTER}'!{CATEGORY_COL}1:{CATEGORY_COL}{max(count + 1, 1)}",
    ).execute().get("values", [])
    existing = [(r[0] if r else "") for r in existing_data]
    target = ["Job Categories", *labels]
    differences = [i for i, val in enumerate(target) if val != (existing[i] if i < len(existing) else "")]
    changes = []
    if differences:
        groups = []
        group = [differences[0]]
        for i in differences[1:]:
            if i == group[-1] + 1:
                group.append(i)
            else:
                groups.append(group)
                group = [i]
        groups.append(group)
        for group in groups:
            first, last = group[0], group[-1]
            # Master row 1 is index 0, master data begins at row 2.
            changes.append({"range": f"'{MASTER}'!{CATEGORY_COL}{first + 1}:{CATEGORY_COL}{last + 1}",
                            "values": [[v] for v in target[first:last + 1]]})
        sheets.spreadsheets().values().batchUpdate(
            spreadsheetId=SHEET_ID,
            body={"valueInputOption": "RAW", "data": changes},
        ).execute()

    dropdown = [{"userEnteredValue": val} for val in options]
    if dropdown:
        sheets.spreadsheets().batchUpdate(
            spreadsheetId=SHEET_ID,
            body={"requests": [{"repeatCell": {
                "range": {
                    "sheetId": _sheet_id(sheets, MASTER),
                    "startRowIndex": 1,
                    "endRowIndex": max(2, row_capacity),
                    "startColumnIndex": 15,
                    "endColumnIndex": 16,
                },
                "cell": {"dataValidation": {
                    "condition": {"type": "ONE_OF_LIST", "values": dropdown},
                    "strict": True,
                    "showCustomUi": True,
                }},
                "fields": "dataValidation",
            }}]},
        ).execute()
    return len(differences)


def sync_once(sheets):
    dimensions = tabs_and_dimensions(sheets)
    if MASTER not in dimensions:
        raise RuntimeError("Taaza master Jobs tab not found. No spreadsheet changes made.")
    tabs = [t["name"] for t in discover_job_tabs(sheets)]
    master_rows = get_values(sheets, MASTER)
    sources = {tab: get_values(sheets, tab) for tab in tabs}
    additions, counts = candidates(master_rows, sources)
    first = None

    if additions:
        # Re-read shortly before append; preserve master edits made meanwhile.
        fresh = get_values(sheets, MASTER)
        additions, counts = candidates(fresh, sources)
        if additions:
            occupied = [i + 2 for i, row in enumerate(fresh) if any(str(v).strip() for v in row[:3])]
            first = (max(occupied) + 1) if occupied else 2
            last = first + len(additions) - 1
            target = get_values(sheets, MASTER, first, min(last, dimensions[MASTER]))
            if any(_occupied(row) for row in target):
                raise RuntimeError("Jobs destination contains data; refusing to overwrite.")
            if last > dimensions[MASTER]:
                sheets.spreadsheets().batchUpdate(
                    spreadsheetId=SHEET_ID,
                    body={"requests": [{"appendDimension": {
                        "sheetId": _sheet_id(sheets, MASTER),
                        "dimension": "ROWS",
                        "length": last - dimensions[MASTER],
                    }}]},
                ).execute()
                dimensions[MASTER] = last
            sheets.spreadsheets().values().update(
                spreadsheetId=SHEET_ID,
                range=f"'{MASTER}'!A{first}:M{last}",
                valueInputOption="RAW",
                body={"values": additions},
            ).execute()
            written = get_values(sheets, MASTER, first, last)
            if len(written) != len(additions) or any(
                canonical(row[2] if len(row) > 2 else "") != canonical(values[2])
                for row, values in zip(written, additions)
            ):
                raise RuntimeError("Taaza master write verification failed.")

    # The category dropdown must be refreshed on EVERY run, even with zero new
    # jobs: tab renames and shared specialist membership also change over time.
    current = get_values(sheets, MASTER)
    changed = sync_categories(sheets, current, sources, dimensions[MASTER])
    return {"added": len(additions), "by_source": counts,
            "master_row": first, "category_cells_changed": changed}


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
