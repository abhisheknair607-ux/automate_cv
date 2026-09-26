# Setup checklist

The code is intentionally disabled until runtime credentials are complete.

## Already wired in the repository

The hourly workflow already knows the verified IDs for:
- Freshmal;
- Prompt 1 / Prompt 2 / Prompt 3 in the Automate CV Drive folder;
- Automate CV / Outputs;
- Abhishek Summary Doc;
- CV Formatting & Structure Master;
- base CV;
- high-experience and lower-experience CV references;
- CV & Cover letter rules;
- Final Project Files and Projects folders.

These IDs are non-secret and can be overridden with repository variables if the source files move.

## Still required before the first live run

### 1. OpenAI
Add repository secret:
- `OPENAI_API_KEY`

Do not paste the key into source code, Freshmal or a prompt.

### 2. Google authentication
GitHub Actions cannot automatically use the Google Drive connection from ChatGPT. It needs its own Google API credentials with access to the Freshmal sheet and the relevant Drive folders/files.

Preferred deployment options:
- service-account JSON stored as repository secret `GOOGLE_SERVICE_ACCOUNT_JSON`, with the Freshmal sheet and required Drive folders shared to that service account; or
- OAuth client ID/secret/refresh token stored in the three `GOOGLE_OAUTH_*` secrets.

Use one method, not both.

### 3. Optional cover-letter template
`COVER_LETTER_TEMPLATE_FILE_ID` is intentionally blank because Prompt 3 currently contains a placeholder rather than naming one authoritative base cover-letter file. CV-only runs do not need this. Before enabling Make CL in production, select the desired template and set this repository variable.

## Safe activation sequence

1. Keep repository variable `AUTOMATION_ENABLED` unset or `false`.
2. Add OpenAI and Google secrets.
3. Run repository tests.
4. Use one controlled Freshmal row with Make CV checked, Make CL unchecked, Web Search unchecked.
5. Trigger the worker manually.
6. Inspect Stage 1/2/3 audit files, final DOCX, rendered page, Drive folder, Application Context and Freshmal status.
7. Test Make CL separately after the cover-letter template is configured.
8. Test Web Search separately.
9. Only after successful controlled tests set repository variable `AUTOMATION_ENABLED=true` to activate the hourly schedule.

Never store API keys or Google credential material in source files, prompt files or Freshmal cells.
