# Freshmal CV Automation — Master Plan

## Goal

Automate the repetitive CV workflow while preserving human control over the job description and later manual editing.

## Control flow

1. User pastes the complete JD into Freshmal.
2. User verifies Company, Designation, Application Link and raw JD.
3. User checks Make CV only after that review.
4. Optional Make CL and Web Search switches are independent.
5. Hourly worker claims eligible rows and prevents duplicate processing.
6. Stage 1 runs with the exact Prompt 1 and raw JD.
7. Stage 2 runs with the exact Prompt 2, Stage 1 output and Summary Doc evidence.
8. Stage 3 runs with Prompt 3 plus the authorised automation-control block, Stage 1, Stage 2 and selected source files.
9. Word artifact(s) are generated, rendered and quality checked.
10. Final artifacts and audit files are uploaded to Google Drive.
11. Freshmal status/links/cost/error fields are updated.
12. `Application_Context.md` preserves the application state for later continuation in a normal ChatGPT Project chat.

## Freshmal columns

Visible inputs:
- A Company Name
- B Designation
- C Application Link
- D Job Description
- E/F/G Pooja: Make CV / Make CL / Web Search
- H/I/J Abhishek: Make CV / Make CL / Web Search
- K Pooja status
- L Abhishek status

Abhishek automation metadata uses M:V:
- M Application ID
- N JD hash
- O Workflow state
- P Lock ID
- Q Last run
- R CV link
- S Cover-letter link
- T Application-context link
- U API cost USD
- V Error

Status dropdown values remain: `NA`, `CV`, `CV+CL`, `CV+CL+WS`.
If Web Search is enabled without a cover letter, the artifact status remains `CV`; the audit/context records that research was performed.

## Prompt integrity

Prompt 1 and Prompt 2 are loaded from the supplied authoritative Google Drive files without modification.

Prompt 3 is also loaded from its authoritative Drive file. The code inserts only `prompts/03_automation_controls.md` at runtime. That block makes CV, Cover Letter and Web Search independently controllable. It does not weaken evidence, accuracy, ATS, STAR, page-fit, rendering or QA rules.

The Drive file IDs are pinned in environment configuration. Each run also records the code revision/deployment context so a run can be reproduced.

## Context strategy

Do not optimise cost by deleting important context. Optimise by avoiding irrelevant repeated context.

Always preserve:
- complete raw JD;
- complete Stage 1 output;
- complete Stage 2 output;
- current CV;
- selected source evidence;
- factual guardrails;
- important inclusion/exclusion decisions.

The full Stage 1 and Stage 2 audit outputs are saved. Later manual editing uses the generated Application Context file rather than requiring the user to paste the workflow again.

## Optional features

Default cheapest path:
- CV: ON when selected
- Cover Letter: OFF unless selected
- Web Search: OFF unless selected
- Networking: not part of CV readiness

## Cost controls

Planning model: GPT-5.6 Sol.
Initial CV-only/no-web planning target: about $0.70 per completed application, with real cost captured from API usage.

Initial controls:
- warning: $1.00
- review: $1.25
- hard/manual stop: $1.75 (configurable)

These are planning controls, not guaranteed prices. Recalibrate after 20–30 real runs.

## Reliability

- SHA-256 hash of raw JD detects post-approval changes.
- Changed JD resets the CV approval checkbox and requires review.
- Per-row lock prevents duplicate hourly work.
- Each stage is written to disk before the next stage starts.
- Retries are bounded.
- QA failure ends in manual review rather than infinite retries.
- `CV_READY`/final status is set only after Drive upload succeeds.

## Manual editing after API generation

The API cannot be assumed to create a normal visible ChatGPT Project chat. Each application therefore receives `Application_Context.md` containing the raw JD, Stage 1/2/3 outputs, current CV link and important controls. In the existing ChatGPT Project, the user can start a new chat and ask to continue that Application ID from Drive.

## Deployment

Prototype scheduler: GitHub Actions hourly workflow, disabled until explicitly enabled.
Production recommendation: Cloud Run + Cloud Scheduler + Secret Manager after the pipeline passes controlled tests.

Secrets are never committed. `OPENAI_API_KEY` and Google credentials must be supplied through secret/environment configuration.

## Production acceptance tests

- Blank JD cannot run.
- Make CV unchecked cannot run.
- JD changed after approval cannot run until re-approved.
- Duplicate hourly workers cannot produce duplicate final files.
- Stage 2 cannot execute without Stage 1.
- Stage 3 cannot execute without Stage 1 and Stage 2.
- Prompt 1/2 source text is not modified by the automation.
- Cover Letter and Web Search switches behave independently.
- Unsupported candidate claims are rejected/flagged.
- Final Word files pass page/render QA.
- Drive upload completes before status is marked complete.
- Application Context is created.
- Token/cost data and errors are recorded.
