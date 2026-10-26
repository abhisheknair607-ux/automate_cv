# Stage 2: read-only Taaza duplicate audit

## Verified execution (26 October 2026, Europe/Dublin)

Target: Taaza Videsi Maal, master `Jobs` tab only. The actual Google Sheet was **read**, not modified.

- `693` populated master Jobs entries scanned from `Jobs!A2:E982` (982 total allocated rows, including header and unfilled rows).
- `11` verified exact duplicate groups; `17` exact pairwise matches; `14` candidate redundant records beyond one per exact identity group.
- `41` possible duplicate pairs requiring review, grouped into `27` groups without any exact pair.
- Zero writes, deletions, row movements, Google Drive file operations, Gmail reads or AI model calls.
- GitHub Actions run: https://github.com/abhisheknair607-ux/automate_cv/actions/runs/40286629848
- Authentication: Google workload identity with `spreadsheets.readonly` scope. Workflow has **no schedule** and is isolated to the Stage 2 branch.

Exact-match examples, identified by existing master row numbers (no mutations):

| Employer / role (shortened) | Rows |
| --- | --- |
| BlackRock — Private Credit Fund Accounting Associate | 56, 203, 213 |
| EY — Strategy & Transactions, Valuations/Modelling Executive | 138, 240, 692 |
| Monzo — Operational Tax Senior Manager | 108, 172 |
| Accenture — Management Consultant, Banking | 518, 544 |
| Barclays — Senior Corporate Operations Analyst | 527, 531 |

**Do not automatically delete any record on this basis.** Existing rows may contain JDs, different candidate statuses and historical references. These are audit findings, not cleanup permission.

## Implementation

- `src/automate_cv/job_dedupe.py`: Stage 1 deterministic matcher with Stage 2 fixes for verified regional LinkedIn hosts and stable multi-city matching.
- `src/automate_cv/taaza_dedupe_audit.py`: explicit opt-in `--live` audited read-only scan; verifies headers and row bounds, reads master Jobs columns A:E only, emits aggregate counts to Actions logs.
- `tests/test_taaza_dedupe_audit.py`: no-network mock tests enforce read-only, stable row positions, schema checks, valid record bounds, and duplicate-group calculations.
- `.github/workflows/taaza-stage2-dedupe-readonly.yml`: isolated one-off stage branch push/manual run; no cron and no credentials or raw job links printed.

To run locally with authorized Sheets read-only credentials:

```sh
PYTHONPATH=src python -m automate_cv.taaza_dedupe_audit --live
```

Optionally save a private full report with `--output local_report.json` (never commit this report).

## Next approval gate: Stage 3

Add one `Duplicate Status` field to Jobs only after verifying the full Q-column state, ensure candidate preferences N/O and category P are unchanged; add a compact `Dup` control beside Paste JD, Trash and Heart in Discovery; add duplicate preset filtering and grouped review; add a minimal authenticated status-write endpoint that validates the job identity immediately before updating. Keep the importer paused, avoid deletion and do not modify Make CV code.

Stage 3 requires explicit approval before any Google Sheet edits, webapp merge or deployment. The user verifies and approves here; all GitHub work is handled by the assistant.