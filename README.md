# automate_cv

Freshmal-driven CV automation.

Flow: Freshmal -> Prompt 1 -> Prompt 2 -> Prompt 3 -> DOCX QA -> Google Drive -> Freshmal status.

Abhishek controls: H Make CV, I Make CL, J Web Search, L Status. Columns M:V hold automation metadata, links, cost and errors.

The worker is scheduled hourly and remains disabled until the `AUTOMATION_ENABLED` repository variable is set to `true`.

The authoritative prompts remain in Google Drive. Prompt 1 and Prompt 2 are loaded without modification. Prompt 3 receives only the authorized in-memory conditional block in `prompts/03_automation_controls.md` so CV, cover letter and web research can be controlled independently.

Each completed application receives a Drive folder with the CV, optional cover letter, Stage 1/2/3 audit outputs, and `Application_Context.md` for later continuation in a normal ChatGPT Project chat.

Do not commit credentials to this repository.
