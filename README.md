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

Status dropdowns remain `NA`, `CV`, `CV+CL`, `CV+CL+WS`.

Cover Letter and Web Search are independent optional controls. Web Search is invoked only when that candidate's Web Search checkbox is selected. When Web Search is selected without a Cover Letter, artifact status remains `CV`; the research setting is retained in audit/context information.

If both candidates select Make CV on the same row, the row creates two independent candidate workflows with separate prompts, evidence, state, output files and failure handling.

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
- estimated stage cost

Cost calculation is model-aware for the configured GPT-5.6 Terra and Sol prices and separately accounts for cached reads and cache writes. The configured cost hard stop is checked after each paid stage.

## Reliable resume

Stage 1 and Stage 2 are uploaded to Drive as soon as they finish. `run_manifest.json` stores hashes, model settings and usage history.

Checkpoint reuse is permitted only when the relevant inputs still match:
- Stage 1: candidate + JD hash + Prompt 1 hash + Stage 1 model/reasoning
- Stage 2: Stage 1 key + Prompt 2 hash + Summary Router hash + Stage 1 handoff hash + Stage 2 model/reasoning

This lets a later Stage 3 retry reuse valid earlier reasoning without paying for Stages 1–2 again. Changed inputs invalidate the relevant checkpoint rather than silently reusing stale analysis.

## Hourly safety

The production worker is scheduled at minute 17 of every hour.

Safety controls include:
- terminal errors do not automatically rerun;
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
│           └── Application_Context.md
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

## Pooja setup

A Drive folder named `Pooja Sources` has been prepared under the existing `Automate CV` folder. Add Pooja's verified files there and configure the corresponding `POOJA_*_FILE_ID` repository variables, including `POOJA_MASTER_EVIDENCE_BANK_FILE_ID`.

See `docs/POOJA_SETUP.md` for the rest of the isolation setup and test plan.

## Tests

GitHub Actions runs `pytest` on pushes and pull requests. Tests cover controls/status behavior, hourly eligibility, retry ceilings, stale locks, prompt insertion, compact handoff extraction, cache-aware cost accounting, checkpoint validity, DOCX selection and factual QA.

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
