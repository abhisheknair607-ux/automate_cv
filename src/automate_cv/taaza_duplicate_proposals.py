"""Protected, reviewable duplicate-status proposals for Taaza Jobs!Q.

Read-only by default. 'Dup' means hidden from ordinary Discovery listings,
NOT physically deleted. This tool never deletes spreadsheet rows and respects
existing manual 'Dup' and 'Not Dup' decisions. The optional Q-only apply mode
requires a distinct, disabled-by-default repository approval flag.
"""
from __future__ import annotations

import argparse
import json
import os
from collections import defaultdict
from dataclasses import dataclass

from .job_dedupe import Job, analyze, identity
from .taaza_dedupe_audit import get_sheets_clients
from .taaza_sync import SHEET_ID, google_services

ALLOWED = {"", "Possible", "Dup", "Not Dup"}
COLUMNS = ["Company Name", "Designation", "Link", "Job Description", "Location"]
HEADER_Q = "Duplicate Status"
LIMIT = 10000
PLACEHOLDERS = {"", "open original job description", "paste job description",
                "job description missing"}


@dataclass(frozen=True)
class Vacancy:
    job: Job
    status: str
    # Presence of candidate preferences, CV status, unique details etc.
    protected: bool
    fingerprint: tuple[str, ...] = ()  # all A:Q values, for stale-row detection


def parse_rows(values: list[list], first_row: int = 2) -> list[Vacancy]:
    output = []
    for index, data in enumerate(values):
        fields = [str(v or "").strip() for v in (data + [""] * 17)[:17]]
        if not any(fields[:5]):
            continue
        if not all(fields[i] for i in (0, 1, 2)):
            raise ValueError("Incomplete Jobs entry at row " + str(first_row + index))
        status = fields[16]
        if status not in ALLOWED:
            raise ValueError("Unknown duplicate status at Jobs row " + str(first_row + index))
        has_jd = fields[3].casefold() not in PLACEHOLDERS
        # Substantive job and candidate data require human review; no hidden
        # deletion or silent loss of progress when jobs are repeated.
        protected = (has_jd or any(fields[i] for i in (5, 6, 7, 9, 11, 13, 14))
                     or fields[10].casefold() in {"true", "yes", "1"})
        job = Job("Jobs", first_row + index, fields[0], fields[1], fields[4],
                  fields[2], has_jd=has_jd, protected=protected)
        output.append(Vacancy(job, status, protected, tuple(fields)))
    return output


def proposal_plan(items: list[Vacancy]) -> dict:
    jobs = [item.job for item in items]
    audit = analyze(jobs)
    byref = {j.job.row_ref: j for j in items}
    groups: dict[tuple[str, str], list[Vacancy]] = defaultdict(list)
    for entry in items:
        key = identity(entry.job.url)
        if key[1]:
            groups[key].append(entry)
    proposed: dict[str, dict] = {}
    def set_proposal(entry: Vacancy, status: str, match: str, reason: str):
        if entry.status != "" or not status:
            return
        existing = proposed.get(entry.job.row_ref)
        if existing and existing["status"] == "Dup":
            return
        proposed[entry.job.row_ref] = {
            "status": status, "matched_with": match, "reason": reason,
            "expected_url": entry.job.url,
            "expected_company": entry.job.company, "expected_title": entry.job.title,
        }
    for _, same in groups.items():
        if len(same) < 2:
            continue
        # Prefer the most complete job row. Never choose a manually confirmed
        # duplicate as the primary record when another candidate exists.
        kept = min(same,key=lambda x:(
            x.status == "Dup", -int(x.protected), -int(x.job.has_jd), x.job.row))
        for other in same:
            if other is kept:
                continue
            if other.status == "Not Dup":
                continue
            match = next((m for m in audit.exact_pairs
                          if {m.left, m.right} == {other.job.row_ref, kept.job.row_ref}), None)
            conflict = bool(match and "metadata conflict" in match.reason)
            # If unique details, preferences or an ID conflict exist, hold for
            # review rather than removing the vacancy from ordinary Discovery.
            recommended = "Possible" if other.protected or conflict else "Dup"
            set_proposal(other,recommended,kept.job.row_ref,
                         "Protected exact match — manual review" if recommended=="Possible"
                         else "Redundant exact identity; hide from ordinary Discovery")
    for match in audit.possible_pairs:
        for ref,other in ((match.left,match.right),(match.right,match.left)):
            if ref in byref:
                set_proposal(byref[ref],"Possible",other,"Similar employer, city and role")
    return {
        "records":len(items),
        "exact_pairs":len(audit.exact_pairs),
        "possible_pairs":len(audit.possible_pairs),
        "proposed_hide":sum(v["status"]=="Dup" for v in proposed.values()),
        "proposed_review":sum(v["status"]=="Possible" for v in proposed.values()),
        "proposals":dict(sorted(proposed.items(), key=lambda x:int(x[0].split("!")[-1]))),
        "note":"Proposals change only Q after explicit approval. No spreadsheet row deletion.",
    }


def read_live(sheets) -> list[Vacancy]:
    metadata=sheets.spreadsheets().get(spreadsheetId=SHEET_ID,
        fields="sheets(properties(title,gridProperties(rowCount)))").execute(num_retries=3)
    tab=next((t["properties"] for t in metadata.get("sheets", [])
              if t.get("properties",{}).get("title")=="Jobs"),None)
    if not tab:
        raise RuntimeError("Taaza Jobs sheet missing")
    cap=int(tab.get("gridProperties",{}).get("rowCount",0))
    if cap<2 or cap>LIMIT:
        raise RuntimeError("Unexpected Taaza sheet size; refusing scan")
    h=sheets.spreadsheets().values().get(spreadsheetId=SHEET_ID,
        range="'Jobs'!A1:Q1").execute(num_retries=3).get("values",[])
    if not h or len(h[0])<17 or h[0][:5]!=COLUMNS or h[0][16]!=HEADER_Q:
        raise RuntimeError("Duplicate Status schema changed; no updates")
    values=sheets.spreadsheets().values().get(spreadsheetId=SHEET_ID,
        range=f"'Jobs'!A2:Q{cap}").execute(num_retries=3).get("values",[])
    return parse_rows(values)


def write_approved_q(sheets,baseline:list[Vacancy],plan:dict)->int:
    if os.getenv("GARAMAAL_DEDUPE_STATUS_APPROVED") != "true":
        raise RuntimeError("Approval flag for duplicate status writes is not enabled")
    if not plan["proposals"]:
        return 0
    # Re-read all A:Q; any row shift or human change fails the whole batch.
    current=read_live(sheets)
    before={i.job.row_ref:i for i in baseline}
    now={i.job.row_ref:i for i in current}
    updates=[]
    for ref,change in plan["proposals"].items():
        if ref not in before or ref not in now or now[ref]!=before[ref]:
            raise RuntimeError("Taaza changed during scan; no statuses written")
        original=now[ref]
        if original.status!="":
            raise RuntimeError("Manual duplicate decision changed; no statuses written")
        if (original.job.url!=change["expected_url"]
            or original.job.company!=change["expected_company"]
            or original.job.title!=change["expected_title"]):
            raise RuntimeError("Job identity changed; no statuses written")
        row=original.job.row
        updates.append({"range":f"'Jobs'!Q{row}","values":[[change["status"]]]})
    sheets.spreadsheets().values().batchUpdate(
        spreadsheetId=SHEET_ID,
        body={"valueInputOption":"RAW","data":updates},
    ).execute(num_retries=3)
    return len(updates)


def main(argv=None)->int:
    parser=argparse.ArgumentParser(description="Protected duplicate-status preview (read-only default)")
    parser.add_argument("--apply-statuses",action="store_true",
                        help="Write approved proposals to Q only; never delete")
    args=parser.parse_args(argv)
    if args.apply_statuses and os.getenv("GARAMAAL_DEDUPE_STATUS_APPROVED")!="true":
        parser.error("Duplicate-status updates require explicit release approval")
    errors=[]
    providers=google_services() if args.apply_statuses else get_sheets_clients()
    for name,client in providers:
        try:
            data=read_live(client)
            plan=proposal_plan(data)
            written=write_approved_q(client,data,plan) if args.apply_statuses else 0
            print(json.dumps({k:plan[k] for k in (
                "records","exact_pairs","possible_pairs","proposed_hide","proposed_review"
            )}|{"auth":name,"statuses_written":written,"rows_deleted":0}))
            return 0
        except Exception as exc:
            errors.append(name+": "+type(exc).__name__)
    raise RuntimeError("Protected duplicate scan did not complete: "+"; ".join(errors))


if __name__=="__main__":
    raise SystemExit(main())
