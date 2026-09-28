# CV Automation — Architecture Decisions

## Non-negotiable priorities
1. Output quality and factual accuracy come first.
2. Token/cost efficiency is optimized without removing reasoning capability needed for high-quality work.
3. Abhishek and Pooja are isolated candidate profiles. Candidate-specific prompts, evidence, templates, output names, statuses, project folders and source files must never cross-contaminate.
4. The compact Summary Doc / Evidence Router is the routing layer; the Master Evidence Bank is the detailed factual source of truth.
5. Existing three-stage reasoning is preserved. Optimization is measurement-led rather than achieved by blindly shortening prompts.
6. Web Search remains an independent user control. It is never invoked unless the candidate's Web Search checkbox is selected.
7. Failed applications resume from the latest valid checkpoint; already-valid paid stages are not repeated merely because a later operation failed.

## Stage design
- Stage 1: candidate-specific Prompt 1 + company/role/link + raw JD. Output includes a compact `STAGE1_HANDOFF`.
- Stage 2: candidate-specific Prompt 2 + compact Summary Router as the stable cache prefix, then raw JD + `STAGE1_HANDOFF`. Output includes `STAGE2_HANDOFF`.
- Stage 3: candidate-specific Prompt 3 + controls + raw JD + `STAGE2_HANDOFF` + candidate-specific mounted source files. The detailed Master Evidence Bank is mounted for selective verification instead of being copied wholesale into the text prompt.

Full Stage 1 and Stage 2 prose remains stored in Drive for audit/recovery, but only compact handoffs are forwarded downstream.

Moving a long prompt from inline text to a Drive file does not by itself reduce model input tokens; the model still has to receive/read the content. Prefer compact handoffs, selective evidence retrieval, stable-prefix prompt caching and measured removal of duplication.

## Phase A — hourly safety and failed-row recovery
- Every failure is surfaced as visible `ERROR` in that candidate's Status column.
- Terminal states do not rerun automatically: `ERROR_MANUAL`, `ERROR_CONFIG`, `JD_CHANGED_REVIEW_REQUIRED`, `ERROR_MAX_RETRIES`.
- Terminal failures automatically untick that candidate's Make CV checkbox.
- After the underlying cause is fixed/reviewed, re-checking Make CV on the same `ERROR` row is the deliberate retry signal. Hidden workflow/error columns do not need to be cleared and the vacancy does not need to be copied to a new row.
- Retryable row failures are bounded by `MAX_ROW_ATTEMPTS`.
- Locks older than `STALE_LOCK_MINUTES` are treated as stale and can be reclaimed.
- Individual AI operations retry only transient network/API conditions such as timeouts, 429 and 5xx errors.
- One failed candidate job does not block other eligible jobs in the hourly batch.
- If no candidate work item is eligible, no OpenAI workflow call is made.

## Phase B — model routing, caching and cost telemetry
Default stage routing:
- Stage 1: `gpt-5.6-terra`, low reasoning
- Stage 2: `gpt-5.6-terra`, medium reasoning
- Stage 3: `gpt-5.6-sol`, medium reasoning

Prompt caching is used only where a stable reusable prefix exists:
- Stage 1: Prompt 1 before the changing JD.
- Stage 2: Prompt 2 + compact Summary Router before the changing JD and Stage 1 handoff.
- Stage 3 does not assume Terra cache can transfer to Sol and does not pre-warm a one-use cache.

For every paid AI stage record:
- model
- input tokens
- cached input tokens
- cache-write tokens
- ordinary uncached input tokens
- output tokens
- reasoning tokens
- estimated model-token cost
- visible billable built-in tool activity and estimated tool cost
- cumulative application cost

The configured cost hard stop is checked after every paid stage and also when a paid checkpoint is restored, preventing a manual retry from bypassing the configured spend guardrail.

## Phase C — durable resume checkpoints
The workflow persists checkpoints at every material boundary:

1. **Stage 1 complete** — `stage1.md` + matching Stage 1 key.
2. **Stage 2 complete** — `stage2.md` + matching Stage 2 key.
3. **Stage 3 generation complete** — `stage3.md` + all generated artifacts needed for normalization, persisted under `_Resume_Checkpoints/Stage3_Generated`.
4. **Normalization complete** — deterministic normalized CV and optional cover letter persisted under `_Resume_Checkpoints/Normalized`.
5. **QA passed** — one-page structural checks complete and `Factual_QA.md` written.
6. **Drive upload complete** — final CV/cover-letter files exist in the application folder and their links are stored.
7. **Finalization complete** — audit/context files written and candidate Freshmal status updated.

`run_manifest.json` stores checkpoint keys, input/source hashes, model/reasoning settings, usage history, cumulative cost and output links.

Checkpoint validity is fail-closed:
- Stage 1 requires matching candidate + JD hash + Prompt 1 hash + Stage 1 model/reasoning.
- Stage 2 additionally requires matching Prompt 2 hash + Summary Router hash + Stage 1 handoff hash + Stage 2 model/reasoning.
- Stage 3 additionally requires matching Stage 2 key, Prompt 3 hash, Master Evidence Bank hash, Stage 2 handoff hash, hashes of all mounted Stage 3 source files, company/role/location/link, requested CL/web-search controls and Stage 3 model/reasoning.
- Normalize requires the valid Stage 3 generation key plus expected output filenames.
- QA requires hashes of the normalized artifacts plus the Master Evidence Bank hash.
- Drive upload requires the valid QA key plus final artifact hashes and verifies the final files still exist in Drive.

Resume behavior:
- Stage 1 failure → retry Stage 1.
- Stage 2 failure → reuse Stage 1; retry Stage 2.
- Stage 3 API/generation failure → reuse Stages 1–2; retry Stage 3.
- Normalization failure caused by missing/unidentifiable requested DOCX → invalidate Stage 3 and regenerate it.
- QA wrong-page-count failure → invalidate Stage 3 and regenerate it, because rerunning QA on the same document cannot fix the document.
- Operational QA/rendering failure → preserve Stage 3 + normalized artifacts and retry QA only.
- Drive upload failure → reuse Stage 3 + normalization + QA; retry upload only.
- Final audit/Sheet-update failure → reuse the already-uploaded final documents and retry finalization only.

A changed input invalidates only the affected checkpoint and everything downstream of it. Usage history remains auditable and prior paid cost is not erased.

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

Both visible Status dropdowns allow `NA`, `CV`, `CV+CL`, `CV+CL+WS`, `ERROR`.

AG = optional Location. Location is used only for folder naming and is never invented. If blank, the role folder uses the designation alone.

If both candidates are selected on the same row, run two independent workflows against the same job information. A failure for one candidate must not overwrite or block the other candidate's status/output.

Do not share Stage 1 between candidates by default. Their prompts remain independent.

## Candidate profiles
Each candidate profile resolves its own:
- display/full name and filename-safe name
- Prompt 1 / Prompt 2 / Prompt 3
- compact Summary Doc / Evidence Router
- Master Evidence Bank
- Base CV
- formatting master
- high-experience reference CV (optional unless the candidate prompt requires it)
- lower-experience reference CV (optional unless the candidate prompt requires it)
- CV/cover-letter rules
- cover-letter template if used
- candidate-specific project folders
- output/status/state columns

Missing required candidate configuration fails as `ERROR_CONFIG` before any OpenAI stage is run.

## Google Drive output architecture
All generated application outputs live under the configured Outputs root, separated by candidate immediately under Outputs:

```text
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
        _Resume_Checkpoints/
          Stage3_Generated/
          Normalized/

  Pooja/
    Company/
      Designation, Location/
        same artifact/audit structure
```

Existing candidate/company/role/checkpoint folders and files are reused rather than duplicated on retries.

## Phase E — quality protection
- CV and Cover Letter artifacts are selected deterministically rather than taking the first DOCX returned.
- CV and requested Cover Letter must each render to exactly one page.
- The finished CV is checked against the detailed Master Evidence Bank, not the compact Router, for unsupported percentages, currency amounts, count/duration figures, ratios/scores, exam-progress figures, month/year dates, years, qualification/status terms and named tools/software.
- Factual findings currently remain advisory in `Factual_QA.md`; structural failures such as missing artifacts or wrong page counts remain blocking.
- Unusual standalone large numbers are surfaced as review warnings rather than silently accepted.
- If factual QA is later configured to emit blocking `critical` findings, that result invalidates the Stage 3 artifact so the same bad CV is not merely rechecked.
- Automated tests cover controls/status behavior, terminal eligibility, deliberate same-row retry, stale locks, retry ceilings, candidate column isolation, Prompt 3 insertion-marker behavior, cache-aware cost accounting, Stage 1/2/3 checkpoint validity, downstream invalidation boundaries, QA regeneration rules, candidate-first folder hierarchy, DOCX selection and factual QA.

## Production activation
The scheduled worker runs at minute 17 of every hour. Production activation remains controlled by `AUTOMATION_ENABLED=true`.

Keep it false until:
1. CI passes on the optimization branch.
2. `connectivity-test` succeeds.
3. One controlled Abhishek application succeeds end-to-end.
4. A controlled retry confirms the workflow resumes from the latest valid checkpoint without repeating already-valid paid stages.
5. Final CV, QA and token/cost telemetry are reviewed.
