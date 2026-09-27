# automate_cv

Freshmal-driven, multi-profile CV automation using GPT-5.6 Sol, Google Drive and GitHub Actions.

## Production flow

Freshmal → candidate controls → Prompt 1 → Prompt 2 → Prompt 3 → deterministic QA → Google Drive → candidate-specific Freshmal status.

The workflow is intentionally fail-closed: missing candidate configuration, changed job descriptions, terminal QA errors and exhausted retry budgets are not silently rerun every hour.

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
- Summary Doc
- Base CV
- formatting master
- reference CVs
- CV / Cover Letter rules
- optional Cover Letter template
- project folders

A missing required profile configuration becomes `ERROR_CONFIG` before an OpenAI stage starts. Candidate evidence must never be shared implicitly across profiles.

## Prompt policy

Authoritative prompts remain in Google Drive.

- Prompt 1: loaded without rewriting.
- Prompt 2: loaded without rewriting.
- Prompt 3: loaded without rewriting; the worker inserts the authorised automation-control block from `prompts/03_automation_controls.md` at its defined marker.

The Summary Doc remains the consolidated master candidate-evidence source. Token optimization does not remove it.

## Level-2 efficiency

Each paid stage records:
- input tokens
- cached input tokens
- uncached input tokens
- output tokens
- reasoning tokens
- estimated stage cost

Stage 2 places stable candidate evidence before changing job-specific material to improve prompt-cache eligibility. Reasoning effort and output caps are configurable per stage, but default to `medium` until measured quality testing supports a reduction.

The configured cost hard stop is checked after each paid stage.

## Reliable resume

Stage 1 and Stage 2 are uploaded to Drive as soon as they finish. `run_manifest.json` stores hashes and usage history.

Checkpoint reuse is permitted only when the relevant inputs still match:
- Stage 1: candidate + JD hash + Prompt 1 hash
- Stage 2: Stage 1 key + Prompt 2 hash + Summary Doc hash + Stage 1 output hash

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
- the finished CV is checked against the candidate Summary Doc for unsupported high-risk percentages, currency amounts, qualifications/status terms, and named tools/software;
- other numeric claims are surfaced as review warnings;
- critical factual QA failures become `ERROR_MANUAL` and do not recur hourly.

## Pooja setup

A Drive folder named `Pooja Sources` has been prepared under the existing `Automate CV` folder. Add Pooja's verified files there and configure the corresponding `POOJA_*_FILE_ID` repository variables.

See `docs/POOJA_SETUP.md` for the exact list and isolation test plan.

## Tests

GitHub Actions runs `pytest` on pushes and pull requests. Tests cover controls/status behavior, hourly eligibility, retry ceilings, stale locks, profile isolation, Prompt 3 control insertion, DOCX selection and factual QA.

## Secrets

Never commit credentials. Keep these as GitHub Actions secrets:
- `OPENAI_API_KEY`
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REFRESH_TOKEN`

WIF identifiers and Drive file IDs are non-secret repository variables.

## Documentation

- `docs/ARCHITECTURE_DECISIONS.md` — authoritative A–E architecture and safety decisions
- `docs/LEVEL2_OPTIMIZATION.md` — measurement-led efficiency plan
- `docs/POOJA_SETUP.md` — Pooja source/configuration checklist
- `docs/MASTER_PLAN.md` — original project architecture
- `docs/SETUP.md` — infrastructure/setup notes
