# automate_cv

Freshmal-driven CV automation using GPT-5.6 Sol.

## Flow

Freshmal → human review / Make CV → Prompt 1 → Prompt 2 → Prompt 3 → DOCX QA → Google Drive → Freshmal status.

### Freshmal controls

Abhishek:
- H = Make CV
- I = Make CL
- J = Web Search
- L = Status
- M:V = automation metadata, links, cost and errors

Pooja controls remain E:G with status in K, but the current worker is configured for the Abhishek workflow/source set.

Status dropdowns: `NA`, `CV`, `CV+CL`, `CV+CL+WS`.

Cover Letter and Web Search are independent optional switches. If Web Search is selected without a Cover Letter, the final artifact status remains `CV` and the research activity is retained in the audit/application context.

## Prompt policy

The authoritative Prompt 1, Prompt 2 and Prompt 3 files remain in the supplied Google Drive Automate CV folder.

- Prompt 1: loaded without modification.
- Prompt 2: loaded without modification.
- Prompt 3: loaded without rewriting; the worker inserts only the authorised conditional block in `prompts/03_automation_controls.md` at runtime so CV, Cover Letter and Web Search can be controlled independently.

## Outputs

Each completed application receives a Google Drive folder containing:
- final CV;
- optional cover letter;
- Stage 1/2/3 audit outputs;
- `Application_Context.md` for later continuation in a normal ChatGPT Project chat.

## Scheduling

The repository contains an hourly GitHub Actions worker. It remains disabled until `AUTOMATION_ENABLED=true` is configured. Production can later move to Cloud Run + Cloud Scheduler.

## Secrets

Do not commit credentials. Configure `OPENAI_API_KEY` and Google credentials only through secret/environment configuration.

## Documentation

- `docs/MASTER_PLAN.md` — full architecture and decisions.
- `docs/SETUP.md` — setup requirements.

The API key is intentionally not required to prepare or review the codebase; it is only needed when live API execution is enabled.
