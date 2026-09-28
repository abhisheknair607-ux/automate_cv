# Production CV optimization — 2026-09-28

This note records the final pre-production architecture on `stage-model-cache-router-optimization`.

## Model flow

- Stage 1: `gpt-5.6-terra`, low reasoning
- Stage 2: `gpt-5.6-terra`, medium reasoning
- Stage 3: `gpt-5.6-sol`, medium reasoning

The raw JD remains in Python application state and is supplied wherever role facts are required.

## Evidence flow

1. Stage 1 classifies the JD and emits `STAGE1_HANDOFF`.
2. Stage 2 receives the raw JD, Stage 1 handoff and compact Summary Router. It emits `STAGE2_HANDOFF` with stable evidence IDs.
3. Python reads the full Master Evidence Bank locally and deterministically creates `Selected_Evidence.md` from only evidence IDs selected or explicitly marked for Stage 3 verification.
4. Stage 3 receives:
   - raw JD;
   - `STAGE2_HANDOFF`;
   - `Selected_Evidence.md`;
   - CV Formatting & Structure Master;
   - editable Base CV;
   - exactly one High Experience or Lower Experience reference selected by `cv_structure`;
   - specifically named unresolved source files only when Stage 2 explicitly identifies them.
5. The full Summary Router and full Master Evidence Bank are not uploaded to Stage 3 in the normal path.
6. The full Master Evidence Bank remains local and is used by deterministic factual QA against the finished CV.

Evidence extraction fails closed if Stage 2 selects an unknown evidence ID or the expected Master Bank section cannot be located uniquely.

## CV / Cover Letter rules

`CV & Cover letter.docx` substantially duplicates the CV-only drafting, accuracy, STAR, page-fit and ATS rules already present in Prompt 3 and the Formatting Master. Therefore:

- CV only: do not upload `CV & Cover letter.docx` to Stage 3.
- Cover Letter selected: upload `CV & Cover letter.docx` and any configured dedicated Cover Letter template, because its cover-letter and company-research rules are then required.

This condition is covered by automated tests.

## Stage 3 textual output

Stage 3 must still produce an ATS/recruiter assessment for manual review, but it should be compact. Preserve:

- ATS Match Score;
- short category breakdown;
- strongest matched keywords;
- material missing / unsupported keywords;
- strongest recruiter positives and principal concerns;
- material deviations from Stage 2 evidence selection;
- unresolved factual gaps.

Do not repeat the full Stage 1 / Stage 2 analysis.

## Hourly worker and caching

Production remains scheduled once per hour at minute 17.

A 30-minute prompt-cache lifetime cannot be relied upon across hourly runs. The worker therefore enables explicit Stage 1/2 caching only when the same candidate has two or more eligible applications in the current batch. Candidate applications are processed adjacent to one another.

- one candidate application in the batch: no explicit cache write;
- two or more same-candidate applications: first request may create the reusable prefix and following adjacent requests may reuse it;
- no assumption that a Terra cache can be reused by Sol;
- no eligible Freshmal rows means no OpenAI workflow calls.

This keeps hourly polling convenient without intentionally paying cache-write premiums that are unlikely to be reused.

## Stage 3 source telemetry

`Token_Usage.json` records Stage 3 source telemetry in addition to model/tool usage:

- exact source filename;
- source size in bytes;
- source count;
- total source bytes.

A CV-only run should normally show `Selected_Evidence.md`, Formatting Master, Base CV and one reference CV. It should not show the full Summary Router, full Master Evidence Bank or `CV & Cover letter.docx`.

A Cover Letter run should additionally show `CV & Cover letter.docx` and, when configured, the dedicated Cover Letter template.

## Failure recovery

Durable checkpoints exist after:

1. Stage 1;
2. Stage 2;
3. Stage 3 generation + generated DOCX artifacts;
4. normalization;
5. QA;
6. final Drive upload;
7. final Freshmal/audit update.

Retries resume from the latest valid checkpoint. Terminal failures show `ERROR` in Freshmal and untick Make CV; after the underlying issue is fixed, re-checking Make CV on the same row resumes that application without clearing hidden workflow columns.

## Production activation sequence

Keep `AUTOMATION_ENABLED=false` and PR #2 in draft until all steps below are complete:

1. Verify repository variables/secrets.
2. Run `connectivity-test` on `stage-model-cache-router-optimization`.
3. Run one `controlled-cv-test` on the same branch.
4. Inspect the final one-page CV, compact ATS report, `Factual_QA.md`, Stage 1/2 handoffs and `Token_Usage.json`.
5. Confirm Stage 3 source telemetry matches the requested artifact type.
6. Verify one controlled retry/resume scenario.
7. Merge PR #2.
8. Set `AUTOMATION_ENABLED=true` to activate the hourly production worker.

Do not use an old `main` controlled run as the cost baseline for this architecture.
