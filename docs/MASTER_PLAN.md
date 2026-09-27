# Freshmal CV Automation — Master Plan

`docs/ARCHITECTURE_DECISIONS.md` is the authoritative implementation specification for Phases A–E. This document gives the end-to-end operating model.

## Goal
Automate the repetitive CV workflow while preserving human control over job inputs, factual accuracy, candidate isolation and later manual editing.

## Control flow
1. User pastes the complete JD into Freshmal and verifies Company, Designation, Application Link and raw JD.
2. Optional AG Location may be entered for folder naming. If blank, no location is invented.
3. User selects candidate-specific controls: Pooja E:G or Abhishek H:J.
4. Hourly worker checks eligibility before any OpenAI workflow call.
5. Each selected candidate becomes an independent work item, even when both candidates use the same Freshmal row/JD.
6. Stage 1 runs with that candidate's Prompt 1 and the raw JD.
7. Stage 2 runs with that candidate's Prompt 2, Summary Doc, Stage 1 output and raw JD.
8. Stage 3 runs with that candidate's Prompt 3, controls, Stage 1/2 and candidate-specific source files.
9. Word artifact(s) are normalized, rendered and quality checked.
10. Factual QA checks high-risk claims against that candidate's Summary Doc.
11. Final artifacts, checkpoints, manifest, usage telemetry and audit files are uploaded to the candidate's Drive application folder.
12. Candidate-specific Freshmal status/link/cost/error state is updated.
13. `Application_Context.md` preserves the application state for later continuation in a normal ChatGPT Project chat.

## Freshmal columns
Shared visible inputs:
- A Company Name
- B Designation
- C Application Link
- D Job Description
- AG Location (optional)

Pooja visible controls/state:
- E Make CV
- F Make CL
- G Web Search
- K Status

Abhishek visible controls/state:
- H Make CV
- I Make CL
- J Web Search
- L Status

Hidden/internal state:
- M:V Abhishek workflow metadata
- W:AF Pooja workflow metadata

Each internal block stores Application ID, JD hash, workflow state, lock, last run, CV link, CL link, context link, cumulative estimated cost and error.

Status dropdown values remain `NA`, `CV`, `CV+CL`, `CV+CL+WS`. Web Search remains independent from Cover Letter; CV+WS without a Cover Letter retains final artifact status `CV` while the audit records the research setting.

## Candidate isolation
Pooja and Abhishek have separate profile configuration for prompts, Summary Doc, Base CV, formatting resources, reference CVs, rules, optional template and project folders. Missing required candidate configuration fails before an OpenAI stage starts.

One candidate's failure must not overwrite or block the other candidate's work item on the same row.

## Prompt integrity and context strategy
Prompt 1 and Prompt 2 are loaded from authoritative Drive files without rewriting. Prompt 3 is loaded from its authoritative Drive file and receives only the approved automation-control insertion at its defined marker.

Do not optimize cost by deleting important context. The Summary Doc remains the consolidated master evidence source. Level-2 optimization first uses cache-friendly ordering, stage-specific telemetry, bounded outputs and reliable resume.

Full Stage 1 and Stage 2 audits remain preserved in Drive.

## Output architecture

```text
Outputs/
├── Abhishek/
│   └── Company/
│       └── Designation, Location/
│           ├── final CV
│           ├── optional Cover Letter
│           ├── stage1.md
│           ├── stage2.md
│           ├── stage3.md
│           ├── run_manifest.json
│           ├── Token_Usage.json
│           ├── Factual_QA.md
│           └── Application_Context.md
└── Pooja/
    └── Company/
        └── Designation, Location/
            └── same artifact/audit structure
```

If AG Location is blank, the application folder is the designation only. Folder/file reuse prevents duplicate structures on retries.

## Phase A reliability / hourly safety
- SHA-256 JD hash detects post-approval changes.
- Changed JD unchecks that candidate's Make CV and requires deliberate review.
- Terminal states (`ERROR_MANUAL`, `ERROR_CONFIG`, `JD_CHANGED_REVIEW_REQUIRED`, `ERROR_MAX_RETRIES`) do not run every hour.
- Retryable row failures are capped by `MAX_ROW_ATTEMPTS`.
- Locks older than `STALE_LOCK_MINUTES` can be reclaimed.
- Individual AI operations retry only temporary/network/API failures.
- One failed application does not prevent other eligible candidate applications in the same batch from running.
- No eligible work produces no OpenAI workflow call.

## Phase B Level-2 efficiency
Per paid stage record:
- input tokens
- cached input tokens
- uncached input tokens
- output tokens
- reasoning tokens
- estimated stage cost

Stage-specific reasoning effort and max-output caps are configurable. Initial reasoning remains medium until measured comparisons justify changes.

Stable Summary Doc content is placed before changing JD/Stage 1 material in Stage 2 to improve prompt-cache eligibility. Cost hard stop is checked after every paid stage.

## Phase C reliable resume
- Stage 1 is uploaded immediately when complete.
- Stage 2 is uploaded immediately when complete.
- `run_manifest.json` stores checkpoint hashes and usage history.
- Stage 1 is reusable only when candidate/JD/Prompt 1 hashes match.
- Stage 2 additionally requires Prompt 2, Summary Doc and Stage 1 output hashes to match.
- Stage 3 failure can therefore reuse valid Stage 1/2 reasoning on a later permitted retry.
- Changed relevant inputs invalidate stale checkpoints.

## Phase E quality protection
- CV/CL DOCX selection is deterministic rather than first-file-wins.
- Final CV and requested Cover Letter must render to exactly one page.
- Finished CV high-risk claims are checked against the candidate Summary Doc for unsupported percentages, currency amounts, qualification/status terms and named tools/software.
- Other numeric claims are surfaced as audit warnings.
- Critical factual QA failures become `ERROR_MANUAL` rather than recurring hourly.
- Prompt and Summary Doc hashes are retained for traceability.

## Cost controls
The repository's cost calculation is an internal planning/monitoring model and is not treated as a guarantee of provider billing. Keep the current `$1.75` hard stop while A–E telemetry is gathered; recalibrate only from real runs.

The system records cumulative application cost across paid attempts in `run_manifest.json` and `Token_Usage.json` so resume/retry costs remain visible.

## Manual editing after API generation
The API cannot be assumed to create a normal visible ChatGPT Project chat. Each application receives `Application_Context.md` containing the raw JD, Stage 1/2/3 outputs, current CV link and controls. In the existing ChatGPT Project, the user can start a normal chat and use this context for revisions without rerunning the automated stages unnecessarily.

## Deployment
Prototype/production scheduler: GitHub Actions hourly at minute 17. It remains gated by `AUTOMATION_ENABLED` until controlled end-to-end testing passes.

Secrets are never committed. OpenAI and Google OAuth credentials must be supplied through GitHub Actions secrets/environment configuration.

## Production acceptance tests
- Blank JD cannot run.
- Make CV unchecked cannot run.
- Changed JD cannot run until re-approved.
- Terminal errors cannot recur hourly.
- Retryable errors have a finite row-attempt ceiling.
- Stale locks recover while fresh locks prevent duplicate work.
- Stage 2 cannot execute without Stage 1 evidence.
- Stage 3 cannot execute without Stage 1/2 evidence.
- Valid Stage 1/2 checkpoints are reused after downstream failure; stale checkpoints are not.
- Pooja and Abhishek can both apply from one row without source/status cross-contamination.
- Prompt 1/2 source text is not rewritten by the automation.
- Cover Letter and Web Search switches behave independently.
- Unsupported high-risk candidate claims are rejected/flagged.
- Final Word files pass one-page/render QA.
- Drive upload completes before status is marked complete.
- Application Context, token/cost audit and prompt hashes are created.
- Empty hourly scans make no OpenAI workflow calls.
