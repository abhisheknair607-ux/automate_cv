"""Cloud Run Job entrypoint for app-open Garamaal import. No scheduler or GitHub runner.

The importer writes only Email Alerts + Email Import Log, then the existing
verified master sync appends A:M and updates P. Duplicate proposals stay
read-only. Firestore is updated only after the full pipeline succeeds.
"""
from __future__ import annotations

import json
import math
import os
import sys
from datetime import datetime, timedelta, timezone

from google.cloud import firestore

from . import linkedin_alert_import as importer
from .taaza_sync import sync_once
from .taaza_duplicate_proposals import read_live, proposal_plan

DOC_COLLECTION = "garamaalSystem"
DOC_ID = "gmailAutoImportV1"


def utcnow():
    return datetime.now(timezone.utc)


def iso(dt):
    return dt.isoformat(timespec="seconds")


def _run_eligible(data, run_id, now):
    lease = str(data.get("leaseUntil") or "")
    try:
        until = datetime.fromisoformat(lease.replace("Z", "+00:00"))
    except ValueError:
        return False
    return (
        bool(run_id)
        and data.get("runId") == run_id
        and data.get("status") in ("dispatching", "running")
        and until > now
    )


@firestore.transactional
def mark_complete(transaction, ref, run_id, result, duplicates, now):
    snapshot = ref.get(transaction=transaction)
    current = snapshot.to_dict() or {}
    if current.get("runId") != run_id:
        return False
    transaction.set(ref, {
        "status": "succeeded",
        "runId": None,
        "leaseUntil": None,
        "retryAt": None,
        "lastError": None,
        "lastSuccessAt": iso(now),
        "lastResult": {
            "added": int(result.get("added", 0)),
            "duplicates": int(result.get("duplicates", 0)),
            "review_jobs": int(result.get("review_jobs", 0)),
            "messages": int(result.get("messages", 0)),
            "masterAdded": int(result.get("masterAdded", 0)),
        },
        "duplicates": duplicates,
    }, merge=True)
    return True


@firestore.transactional
def mark_failed(transaction, ref, run_id, now):
    snapshot = ref.get(transaction=transaction)
    current = snapshot.to_dict() or {}
    if current.get("runId") != run_id:
        return False
    transaction.set(ref, {
        "status": "failed", "runId": None, "leaseUntil": None,
        "lastError": "Import or master sync failed; safe retry available",
        "retryAt": iso(now + timedelta(minutes=10)),
    }, merge=True)
    return True


def review_proposals(sheets):
    """Read-only; never modify Jobs!Q or remove rows."""
    plan = proposal_plan(read_live(sheets))
    reviewed = []
    for row_ref, p in plan["proposals"].items():
        try:
            row_num = int(row_ref.split("!")[-1])
        except ValueError:
            continue
        reviewed.append({
            "row": row_num,
            "company": str(p["expected_company"])[:120],
            "title": str(p["expected_title"])[:160],
            "matchedWith": str(p["matched_with"])[:40],
            "reason": str(p["reason"])[:160],
            "recommendation": str(p["status"]),
        })
    reviewed.sort(key=lambda d: (d["recommendation"] != "Possible", d["row"]))
    return {"count": len(reviewed), "items": reviewed[:40]}


def import_and_sync(last_success_at=None):
    # Read enough history after long absences (within the parser's supported
    # 90-day Gmail window), with a two-day overlap for delayed alert emails.
    elapsed = 0.0
    if last_success_at:
        try:
            elapsed = max(0.0, (utcnow()-datetime.fromisoformat(
                str(last_success_at).replace("Z", "+00:00"))).total_seconds()/86400)
        except (ValueError, TypeError):
            pass
    days = max(7, min(90, math.ceil(elapsed)+2))
    gmail = importer.gmail_service()
    result = None
    duplicate_summary = None
    for kind, sheets in importer.sheet_service():
        try:
            result = importer.run(gmail, sheets, preview=False, days=days,
                                  retry_review=False)
        except Exception as exc:
            if kind == "workload_identity" and importer._sheet_permission_denied(exc):
                continue
            raise
        outcome = sync_once(sheets)
        result["masterAdded"] = outcome["added"]
        duplicate_summary = review_proposals(sheets)
        break
    if result is None:
        raise RuntimeError("Import could not access the authorised Taaza spreadsheet")
    print(json.dumps({
        "imported": result["added"], "masterAdded": result["masterAdded"],
        "duplicateSkipped": result["duplicates"], "possibleDuplicates": duplicate_summary["count"],
        "daysScanned": days,
    }, sort_keys=True), flush=True)
    return result, duplicate_summary


def main():
    run_id = os.environ.get("GARAMAAL_AUTO_RUN_ID", "")
    if not run_id or os.environ.get("GARAMAAL_ALERT_IMPORT_APPROVED") != "true":
        print("Auto-import denied: missing run ID or write approval", file=sys.stderr)
        return 2
    db = firestore.Client()
    ref = db.collection(DOC_COLLECTION).document(DOC_ID)
    before = ref.get().to_dict() or {}
    if not _run_eligible(before, run_id, utcnow()):
        print("Auto-import refused: run lock not owned or expired", file=sys.stderr)
        return 3
    try:
        result, duplicate_summary = import_and_sync(before.get("lastSuccessAt"))
        if not mark_complete(db.transaction(), ref, run_id, result, duplicate_summary, utcnow()):
            raise RuntimeError("Another run owns the lock; completion not written")
    except Exception as exc:
        mark_failed(db.transaction(), ref, run_id, utcnow())
        print("Auto-import failed: " + str(exc)[:240], file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
