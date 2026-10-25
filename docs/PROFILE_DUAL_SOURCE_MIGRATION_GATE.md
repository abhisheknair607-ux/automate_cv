# Garamaal Profile + CV Evidence: Dual-Source Migration Gate

Status: **Prototype controls available; backend switch NOT active**. Production mode: **Drive**. Updated 2026-10-25.

## User intent

- Preserve Abhishek and Pooja's extensive Drive prompts, Summary Routers, Master Evidence Banks, Base CVs, formatting masters, project evidence and historic applications **unchanged**.
- Add repeatable structured **Projects** to Profile: title, role/ownership, dates, deliverables, quantified outcomes, technologies, and evidence/source link. Keep projects separate from standalone achievements.
- Allow a user to compare Drive sources with a structured profile and eventually compare independently generated CVs, ATS fit, source provenance, API token usage, cost and rendering QA.
- Drive must be the default and instantly restorable CV evidence source. Two modes must never silently overwrite each other's data or cached outputs.

## What exists in the October 25 prototype

- Under /prototype, the Profile editor has a *Drive originals / Editable profile* view selector and candidate-specific browser-local Project records.
- Switching views does **not** switch the CV automation; neither mode invokes OpenAI. The Profile editor is not linked to Drive or Firestore. This is UI evaluation, **not** a side-by-side CV output test.
- The existing CV worker reads pinned Drive IDs from `src/automate_cv/profiles.py`, sends a compact Summary Router in the merged Stage 1/2 call, extracts only selected IDs from Master Evidence Bank for Stage 3, and uses the approved Base CV/formatting references. `Token_Usage.json` tracks source bytes and API tokens, separately for each actual generation stage.

## Migration plan (requires a separate backend approval and staging budget gate)

1. **Inventory**: read-only list and exact content/version metadata of configured candidate file IDs and potential scattered historic CV/project sources. No Drive moves, overwrites, renames, deletions or edits. Dedupe using hashes and record provenance/duplicates, preserving contradictory source claims for review.
2. **Private staging copies**: place raw file snapshots in IAM-scoped Cloud Storage and structured text/claims in Firestore. Use Firebase Auth UID owners, server-side ownership assertions and restrictive rules. The current A/P dropdown is **not** proof of ownership and must not enable cross-user reads. Obtain permission/security review before copying private files.
3. **Review/import**: pre-populate employers, studies, qualifications, reusable achievements, career preferences, and Projects from the originals. Show source names, document IDs, version/modified timestamp, and conflict indicators. Require explicit user approval before promoting draft facts.
4. **Backend adapter behind feature flag**: `CV_EVIDENCE_SOURCE=drive` (default) or `profile` (future). The paid worker must reject `profile` unless an authenticated approved version exists and the deployment is explicitly profile-capable; never implicitly fall back to an unrelated user's data.
5. **Side-by-side staging test**: snapshot the same candidate, JD, formatting template and QA rubric; optionally run two separate CV generations **only after explicit paid-cost approval**. Write outputs and telemetry into different isolated folders/IDs; no updates to live Freshmaal queue/status; always record profile version / source document hashes.
6. **Compare and rollback**: report ATS keyword coverage, verified claims, STAR evidence, layout, source bytes, input/output/cached tokens and all chargeable API/tool costs. Restore `drive` mode without changing Drive or discarding profile revisions. Production mode stays Drive until user approval.

## Explicit release blockers

- The profile UI currently stores local browser drafts, not durable cross-device, UID-owned records.
- Staging services have `APP_READ_ONLY=true` and `SOCIAL_READ_ONLY=true`. Do not bypass these flags to run live CV jobs.
- This prototype branch is not a safe one-shot merge into `main` (observed 420 commits ahead, 66 behind and 117 changed paths). A reconciled, scoped PR, full tests and verified production deployment rollback are required.
- Existing prompt caching/checkpoints should be kept. Decreasing source file bytes is not itself proof of lower **billable** tokens: inspect actual stage API usage and total cost.
- No migration, Firestore writes, paid CV comparison, production deployment, or Drive changes are authorised by this documentation alone.
