# CV Automation — Architecture Decisions

## Non-negotiable priorities
1. Output quality and factual accuracy come first.
2. Token/cost efficiency is optimized without removing reasoning capability needed for A-grade work.
3. Abhishek and Pooja are isolated candidate profiles. Candidate-specific prompts, evidence, templates, output names, statuses, project folders and source files must never cross-contaminate.
4. The Summary Doc remains the master consolidated candidate-evidence source. It is not removed merely to save tokens.
5. Existing three-stage reasoning is preserved. Optimization is measurement-led rather than achieved by blindly shortening prompts.
6. Web Search remains an independent user control. It is never invoked unless the candidate's Web Search checkbox is selected.

## Stage design
- Stage 1: candidate-specific Prompt 1 + company/role/link + raw JD.
- Stage 2: candidate-specific Prompt 2 + Summary Doc first (stable prefix), then raw JD + complete Stage 1.
- Stage 3: candidate-specific Prompt 3 + controls + raw JD + complete Stage 1 + complete Stage 2 + candidate-specific source files required by Prompt 3.

Moving a long prompt from inline text to a Drive file does not by itself reduce model input tokens; the model still has to receive/read the content. Prefer stable-prefix prompt caching and measured removal of genuine duplication only after telemetry shows that doing so is safe.

## Phase A — hourly safety
- Terminal states do not rerun automatically: ERROR_MANUAL, ERROR_CONFIG, JD_CHANGED_REVIEW_REQUIRED, ERROR_MAX_RETRIES.
- Retryable row failures are bounded by MAX_ROW_ATTEMPTS.
- Locks older than STALE_LOCK_MINUTES are treated as stale and can be reclaimed.
- Individual AI operations retry only transient network/API conditions such as timeouts, 429 and 5xx errors.
- One failed candidate job does not block other eligible jobs in the hourly batch.
- If no candidate work item is eligible, no OpenAI workflow call is made.

## Phase B — Level-2 optimization
For every AI stage record:
- input tokens
- cached input tokens
- uncached input tokens
- output tokens
- reasoning tokens
- estimated stage cost
- cumulative application cost

Stage-specific reasoning effort and max output-token caps are configurable. Defaults remain medium until measured quality testing justifies lowering them.

Stable candidate evidence is ordered before changing job-specific content where practical to improve cache eligibility. The cost hard stop is checked after every paid stage.

## Phase C — reliable resume
Stage 1 and Stage 2 are uploaded to the application's Drive folder immediately after successful completion.

Checkpoint reuse is fail-closed:
- Stage 1 requires matching candidate + JD hash + Prompt 1 hash.
- Stage 2 additionally requires matching Prompt 2 hash + Summary Doc hash + Stage 1 output hash.
- Prompt 3 hash is stored for audit/version traceability.

If Stage 3 fails and the checkpoint inputs remain unchanged, the next permitted retry reuses valid Stage 1/2 outputs instead of paying for them again.

The application folder contains a run_manifest.json with checkpoint hashes, usage history and cumulative cost.

## Phase D — multi-profile behavior
One spreadsheet row may create zero, one or two independent candidate work items.

Pooja controls:
- E = Make CV
- F = Make Cover Letter
- G = Web Search
- K = Pooja status/output state
- W:AF = hidden Pooja workflow state

Abhishek controls:
- H = Make CV
- I = Make Cover Letter
- J = Web Search
- L = Abhishek status/output state
- M:V = Abhishek workflow state

AG = optional Location. Location is used only for folder naming and is never invented. If blank, the role folder uses the designation alone.

If both candidates are selected on the same row, run two independent workflows against the same job information. A failure for one candidate must not overwrite or block the other candidate's status/output.

Do not share Stage 1 between candidates by default. Their prompts remain independent.

## Candidate profiles
Each candidate profile resolves its own:
- display/full name and filename-safe name
- Prompt 1 / Prompt 2 / Prompt 3
- Summary Doc
- Base CV
- formatting master
- high-experience reference CV (optional unless the candidate prompt requires it)
- lower-experience reference CV (optional unless the candidate prompt requires it)
- CV/cover-letter rules
- cover-letter template if used
- candidate-specific project folders
- output/status/state columns

Missing required candidate configuration fails as ERROR_CONFIG before any OpenAI stage is run.

## Google Drive output architecture
All generated application outputs live under the configured Outputs root, separated by candidate immediately under Outputs:

Outputs/
  Abhishek/
    Company/
      Designation, Location/
        CV
        Cover Letter if requested
        stage1.md
        stage2.md
        stage3.md
        run_manifest.json
        Token_Usage.json
        Factual_QA.md
        Application_Context.md

  Pooja/
    Company/
      Designation, Location/
        same artifact/audit structure

Existing candidate/company/role folders are reused rather than duplicated on retries.

## Phase E — quality protection
- CV and Cover Letter artifacts are selected deterministically rather than taking the first DOCX returned.
- CV and requested Cover Letter must each render to exactly one page.
- High-risk factual QA checks the finished CV against the candidate Summary Doc for unsupported percentages, currency amounts, count/duration figures, ratios/scores, exam-progress figures, month/year dates, years, qualifications/status terms and named tools/software.
- Unusual standalone large numbers that are not confidently classifiable are surfaced as manual-review warnings in Factual_QA.md rather than silently accepted.
- Critical unsupported high-risk claims stop completion with ERROR_MANUAL, preventing automatic hourly regeneration.
- Prompt hashes and Summary Doc hash are preserved in run_manifest.json.
- Automated tests cover controls/status behavior, terminal eligibility, stale locks, retry ceilings, candidate column isolation, Prompt 3 insertion-marker behavior, checkpoint validity, candidate-first folder hierarchy, DOCX selection and factual QA.

## Production activation
The scheduled worker runs at minute 17 of every hour. Production activation remains controlled by AUTOMATION_ENABLED=true. Keep it false until CI passes and a controlled Abhishek end-to-end run succeeds on the merged code.
