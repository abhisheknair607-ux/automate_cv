# Garamaal — Stage 4 integrated release candidate

**Status:** Stage 3 was approved; Stage 4 code is pushed for review only. Not merged to `main`, not deployed to `garamaal.web.app`, and no existing job has been deleted.

## What this branch combines

- Stage 1–2 Python exact/fuzzy matcher, 25 October read-only evidence, and audited live Taaza scan.
- Stage 3 Taaza `Jobs!Q` duplicate dropdown (already installed and empty), candidate-safe Discovery projections, authenticated but normally disabled `Dup` marker, and mobile duplicate preset filters.
- Master Controls ribbon and Import Alerts popup beside Copy ranking prompt, with Preview Import, Check Duplicates, Last Run Status and gated Run Import.
- Original staged LinkedIn/Indeed Gmail parsers. IrishJobs and Jobs.ie remain held for verified source-format review.
- Shared exact identity in `taaza_sync.py` and `linkedin_alert_import.py`, including master Jobs and regional/Email Alerts tabs; incoming exact duplicates skipped before write. No paid AI calls.
- `taaza_duplicate_proposals.py`: read-only protected audit; optional **Q-status-only** proposal updates after independent approval. Does **not** delete rows, move them or modify Freshmaal.
- GitHub Actions manual workflows for importer preview/approved import and duplicate check. Existing regional master sync remains scheduled.
- Authenticated Cloud Run GitHub dispatch uses server-side GitHub token. No token or Google credentials are exposed in browser code.

## Verified live findings

On 26 October 2026, a read-only scan saw **694** populated Jobs rows (one more than the prior 693-job Stage 2 audit), **11** exact duplicate groups, and **14** extra exact-match records. All 14 contain some substantive fields or candidate/CV context, so the conservative safety policy sends them for review instead of physical deletion. The protected Python engine can mark reversible `Possible` or `Dup` states only after explicit approval and after a second full A:Q consistency read.

## Gates and non-goals

| Control | Default | Meaning |
| --- | --- | --- |
| `ALLOW_ALERT_WORKFLOW_DISPATCH` on Cloud Run | off | Disables manual GitHub Actions submissions from dashboard until token permissions and release are verified |
| `GARAMAAL_ALERT_IMPORT_APPROVED` on both Cloud Run and GitHub Actions variables | off | Blocks applying Gmail imports even if a UI button becomes clickable |
| `GARAMAAL_DEDUPE_STATUS_APPROVED` on GitHub Actions variables | off | Blocks writing status proposals to `Jobs!Q`; read-only Check Duplicates always available once dispatch enabled |
| `ALLOW_DUP_STATUS_WRITES` on Cloud Run, with existing production write gates | off | Controls individual authenticated `Dup` card toggles |

**No automatic physical deletion in Stage 4.** The user agreed to safe exact cleanup, which requires an independently verified recovery copy and confirmation that neither candidate nor Freshmaal has unique dependencies. Existing activity and JDs must be preserved. Marking `Dup` only suppresses a row in ordinary Discovery; it remains visible through the duplicates preset.

## Quality assurance

- GitHub Actions `tests`: entire Python suite, on every feature-branch push.
- GitHub Actions `taaza-stage4-integration-safety`: Python exact/fuzzy/importer tests plus Node backend auth, workflow dispatch, duplicate-status and candidate-filter regressions.
- PR `Garamaal UI integration safety` + `stage3-duplicate-backend-safety` protects CV worker and deployed UI contracts.
- Preview any live status proposals with approved read-only WIF before updating Q; no Gmail shared-inbox OAuth has been established as part of this branch.

## One-stage user approval release plan

1. Present this branch/PR and CI links here for user to approve Stage 4.
2. Only then resolve draft PR and merge the release candidate to `main`. Keep the earlier staged PRs unmerged to avoid duplicate merges.
3. Before production deploy, verify active UI service, Firebase rewrite, GitHub Actions workflow presence on default branch, and rollback revision. Deploy Cloud Run/Firebase only with approval.
4. Start by enabling signed-in read-only workflow dispatch (Check Duplicates), verify returned run status, then validate `Dup` without touching either CV worker or other spreadsheet columns.
5. Enable alert `apply` and automated Q proposal writes only after separate data/parser review and verified shared-Gmail OAuth. No paid AI keys or model calls are required.

All code is kept in GitHub; the user need not run shell commands and reviews/approves through ChatGPT.