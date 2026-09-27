# automate_cv

Freshmal-driven, multi-profile CV automation using the OpenAI Responses API, Google Drive and GitHub Actions.

## Production flow

Freshmal → candidate controls → Prompt 1 → Prompt 2 → Prompt 3 → deterministic QA → Google Drive → candidate-specific Freshmal status.

Default model routing is deliberately stage-specific:

- Stage 1: `gpt-5.6-terra`, low reasoning
- Stage 2: `gpt-5.6-terra`, medium reasoning
- Stage 3: `gpt-5.6-sol`, medium reasoning

The workflow is intentionally fail-closed: missing candidate configuration, changed job descriptions, missing machine handoffs, terminal QA errors and exhausted retry budgets are not silently rerun every hour.

## Freshmal controls

### Pooja
- E = Make CV
- F = Make Cover Letter
- G = Web Search
- K = Status
- W:AF = hidden workflow/checkpoint metadata

### Abhishek
- H = Make CV
- I = Make Cover Letter
- J = Web Search
- L = Status
- M:V = workflow/checkpoint metadata

### Shared
- A:D = company, designation, application link, raw job description
- AG = optional Location used only for Drive folder naming

Status dropdowns are `NA`, `CV`, `CV+CL`, `CV+CL+WS`, and `ERROR`.

Cover Letter and Web Search are independent optional controls. Web Search is invoked only when that candidate's Web Search checkbox is selected. When Web Search is selected without a Cover Letter, artifact status remains `CV`; the research setting is retained in audit/context information.

If both candidates select Make CV on the same row, the row creates two independent candidate workflows with separate prompts, evidence, state, output files and failure handling.

## Failed-row recovery

A failed row no longer requires hidden workflow/error columns to be cleared or the vacancy to be copied into a new row.

- Every workflow failure writes `ERROR` in that candidate's visible Status column.
- Retryable failures keep the existing bounded automatic retry behavior until the configured row-attempt ceiling is reached.
- Terminal failures (`ERROR_MANUAL`, `ERROR_CONFIG`, `JD_CHANGED_REVIEW_REQUIRED`, `ERROR_MAX_RETRIES`) automatically untick that candidate's **Make CV** checkbox so they cannot loop unattended every hour.
- After the underlying cause is fixed or reviewed, re-check **Make CV** on the same row. `ERROR` + a newly checked Make CV is treated as an explicit retry request.
- Existing application/checkpoint metadata is retained, so a retry resumes from the latest valid checkpoint rather than starting the whole application again.
- A changed JD is surfaced as `ERROR`, clears stale output links/status, and also requires review followed by re-checking Make CV.

This keeps terminal failures fail-closed while making same-row recovery a deliberate one-checkbox action.

## Candidate isolation

Abhishek and Pooja each resolve their own:
- Prompt 1 / Prompt 2 / Prompt 3
- compact Summary Doc / Evidence Router
- detailed Master Evidence Bank
- Base CV
- formatting master
- reference CVs
- CV / Cover Letter rules
- optional Cover Letter template
- project folders

A missing required profile configuration becomes `ERROR_CONFIG` before an OpenAI stage starts. Candidate evidence must never be shared implicitly across profiles.

## Evidence architecture

The previous single large Summary Doc has been split into two roles:

1. **Summary Doc / Evidence Router** — compact routing layer. Stage 2 uses this to identify the minimum relevant evidence keys for the vacancy.
2. **Master Evidence Bank** — detailed factual source. Stage 3 mounts this for selective verification and deterministic factual QA; its full text is not copied wholesale into the Stage 3 prompt.

For Abhishek, the Drive IDs are currently:

- Summary Router: `1D9Q7feYCDEhhBVW3DIsJy36Al1yjNIia`
- Master Evidence Bank: `1FD2OSAnMpvScnPSawwF7YsyyPoaY84On`

`SUMMARY_DOC_FILE_ID` and `MASTER_EVIDENCE_BANK_FILE_ID` must both be configured explicitly in GitHub Actions. There is no hardcoded production fallback for the Master Evidence Bank; a missing ID fails closed before the CV workflow can proceed.

The raw Job Description remains the employer-side source of truth in every stage that needs role facts.

## Prompt policy and compact handoffs

Authoritative prompts remain in Google Drive.

- Prompt 1 is loaded from Drive and must produce `STAGE1_HANDOFF`.
- Prompt 2 is loaded from Drive and receives the raw JD + only `STAGE1_HANDOFF` + the compact Summary Router. It must produce `STAGE2_HANDOFF`.
- Prompt 3 is loaded from Drive; the worker inserts the authorised automation-control block from `prompts/03_automation_controls.md` at its defined marker. Stage 3 receives the raw JD + `STAGE2_HANDOFF`, not the complete Stage 1 and Stage 2 prose reports.

Full Stage 1 and Stage 2 outputs are still written to Drive for auditability and checkpoint recovery, but they are not forwarded wholesale downstream.

## Prompt caching

GPT-5.6 explicit prompt caching is used only where the prefix is stable and reusable:

- Stage 1 breakpoint: after the stable Prompt 1 instructions; the changing JD comes afterwards.
- Stage 2 breakpoint: after Prompt 2 + the compact Summary Router; the changing JD and Stage 1 handoff come afterwards.

`PROMPT_CACHE_MODE=explicit` and `PROMPT_CACHE_TTL=30m` are configurable. Cache usage is a cost accelerator, not permanent storage: the JD and evidence sources remain in normal workflow state / Google Drive. Stage 3 uses a different model and dynamic Code Interpreter file inputs, so the workflow does not assume that a Terra cache can be reused by Sol.

## Cost telemetry

Each paid stage records:
- model
- input tokens
- cached input tokens
- cache-write tokens
- ordinary uncached input tokens
- output tokens
- reasoning tokens
- estimated model-token cost
- built-in tool activity when present
- estimated built-in tool cost
- estimated combined stage cost

Cost calculation is model-aware for the configured GPT-5.6 Terra and Sol prices and separately accounts for cached reads and cache writes. Stage 3 also records visible Code Interpreter sessions and billable web-search search actions so `Token_Usage.json` does not intentionally omit those known tool charges. Provider billing remains authoritative; the local figures are operational estimates derived from the response telemetry and the pricing constants in the worker.

The configured cost hard stop is checked after each paid stage, including when a paid checkpoint is restored. The current initial safety default is `$1.75` per application; this is a guardrail, not a target and should be reduced only after controlled-run telemetry establishes a safe production threshold.

## Reliable resume

The workflow now has durable checkpoints at every material boundary:

1. Stage 1 complete
2. Stage 2 complete
3. Stage 3 generation complete, including the generated artifact files
4. Normalization complete
5. QA passed
6. Final CV/cover-letter Drive upload complete
7. Final audit files + Freshmal status update

`run_manifest.json` stores the checkpoint keys, hashes, model settings, output links and usage history. Stage 3 raw artifacts and normalized artifacts are also preserved in the role folder under `_Resume_Checkpoints` so a fresh GitHub runner can continue from them.

Checkpoint reuse is permitted only when the relevant inputs still match:

- Stage 1: candidate + JD hash + Prompt 1 hash + Stage 1 model/reasoning
- Stage 2: Stage 1 key + Prompt 2 hash + Summary Router hash + Stage 1 handoff hash + Stage 2 model/reasoning
- Stage 3 generation: Stage 2 key + Prompt 3 hash + detailed evidence hash + selected handoff + hashes of all mounted Stage 3 source files + requested controls + Stage 3 model/reasoning
- Normalize: valid Stage 3 generation key + expected output filenames
- QA: valid normalized artifact hashes + detailed evidence hash
- Drive upload: valid QA key + final artifact hashes

A retry therefore resumes from the latest valid checkpoint. For example, a Stage 3 API failure reuses Stages 1–2; a renderer/tooling failure after normalization retries QA; a Drive upload failure reuses Stage 3, normalization and QA; a final Freshmal update failure reuses the already-uploaded documents.

There are deliberate regeneration rules:

- If Stage 3 itself fails, only Stage 3 is rerun after valid Stage 1/2 checkpoints are reused.
- If normalization proves the requested DOCX artifact is missing/unidentifiable, Stage 3 is invalidated and regenerated.
- If QA proves a generated document has the wrong page count, Stage 3 is invalidated and regenerated because rerunning QA on the same document cannot fix it.
- Operational QA failures such as a renderer/tooling failure preserve the normalized checkpoint and retry from QA.
- If factual QA is ever configured to return a blocking critical result, the Stage 3 artifact is invalidated and regenerated.
- Changed source inputs invalidate the appropriate checkpoint rather than silently reusing stale output.

## Hourly safety

The production worker is scheduled at minute 17 of every hour.

Safety controls include:
- terminal errors do not automatically rerun;
- terminal failures visibly become `ERROR` and automatically untick Make CV;
- a deliberate re-check of Make CV on the same `ERROR` row enables a same-row retry without clearing hidden columns;
- retryable row failures are capped;
- stale locks can be reclaimed after the configured threshold;
- individual AI calls retry only temporary/network/API failures;
- one failed candidate job does not prevent other candidate jobs in the same batch from running;
- no eligible work means no OpenAI workflow call.

Production remains gated by the GitHub repository variable:

`AUTOMATION_ENABLED=true`

Keep it `false` until the merged code passes a controlled end-to-end run.

## Output hierarchy

Generated artifacts are separated by candidate immediately under the configured Outputs folder:

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
│           ├── Application_Context.md
│           └── _Resume_Checkpoints/
│               ├── Stage3_Generated/
│               └── Normalized/
└── Pooja/
    └── Company/
        └── Designation, Location/
            └── same artifact/audit structure
```

If Location is blank, the role folder uses the designation only. Existing folders/files are reused on retries instead of creating duplicate application folders.

## Quality protection

Before completion:
- CV and requested Cover Letter must render to exactly one page;
- DOCX selection is deterministic rather than taking the first artifact returned;
- the finished CV is checked against the detailed Master Evidence Bank, not the compact Router, for unsupported high-risk percentages, currency amounts, qualifications/status terms, dates and named tools/software;
- other numeric claims are surfaced as review warnings;
- project/professional ownership boundaries remain governed by the authoritative Drive prompts and evidence bank.

## Controlled deployment sequence

Keep the optimisation pull request in draft and keep `AUTOMATION_ENABLED=false` until all of the following are complete:

1. Configure the required GitHub Actions variables/secrets, including both Evidence Router and Master Evidence Bank IDs.
2. Run `connectivity-test` successfully on the optimisation branch.
3. Run exactly one known Freshmal row through `controlled-cv-test`.
4. Inspect the final CV, `Factual_QA.md`, `Token_Usage.json`, Stage 1/2 compact handoffs, cache telemetry and any built-in-tool telemetry.
5. As part of the controlled test, verify a failed terminal row shows `ERROR`, Make CV is unticked, and re-checking Make CV makes that same row eligible without clearing hidden columns.
6. Also verify resume behavior: a retry starts from the latest valid checkpoint and does not repeat already-valid paid stages.
7. Merge only after the controlled run is factually correct, one-page, and operationally acceptable.
8. Set `AUTOMATION_ENABLED=true` only after the merged production branch is ready for unattended runs.

## Pooja setup

A Drive folder named `Pooja Sources` has been prepared under the existing `Automate CV` folder. Add Pooja's verified files there and configure the corresponding `POOJA_*_FILE_ID` repository variables, including `POOJA_MASTER_EVIDENCE_BANK_FILE_ID`.

See `docs/POOJA_SETUP.md` for the rest of the isolation setup and test plan.

## Tests

GitHub Actions runs `pytest` on pushes and pull requests. Tests cover controls/status behavior, visible `ERROR` handling, deliberate same-row retries, hourly eligibility, retry ceilings, stale locks, prompt insertion, compact handoff extraction, cache-aware cost accounting, built-in tool-cost accounting, Stage 1/2/3 checkpoint validity, downstream invalidation boundaries, QA regeneration rules, DOCX selection and factual QA.

## Secrets

Never commit credentials. Keep these as GitHub Actions secrets:
- `OPENAI_API_KEY`
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REFRESH_TOKEN`

WIF identifiers, model routing settings and Drive file IDs are non-secret repository variables.

## Documentation

- `docs/ARCHITECTURE_DECISIONS.md` — authoritative architecture and safety decisions
- `docs/LEVEL2_OPTIMIZATION.md` — measurement-led efficiency plan
- `docs/POOJA_SETUP.md` — Pooja source/configuration checklist
- `docs/MASTER_PLAN.md` — original project architecture
- `docs/SETUP.md` — infrastructure/setup notes
