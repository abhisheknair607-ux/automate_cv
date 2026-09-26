# Setup checklist

The code is intentionally disabled until controlled runtime tests are complete.

## Already wired in the repository

The worker already knows the verified IDs for:
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

## Authentication

### OpenAI
Repository secret:
- `OPENAI_API_KEY`

Repository variable:
- `OPENAI_MODEL=gpt-5.6-sol`

Never paste the key into source code, Freshmal or prompt files.

### Google — keyless WIF
GitHub Actions authenticates to Google through Workload Identity Federation. No service-account JSON key is used.

Repository variables:
- `GCP_WORKLOAD_IDENTITY_PROVIDER=projects/597435070079/locations/global/workloadIdentityPools/github-actions/providers/automate-cv-github`
- `GCP_SERVICE_ACCOUNT=cv-automation@abhishek-cv-automation.iam.gserviceaccount.com`

The WIF provider is restricted to `abhisheknair607-ux/automate_cv`. The Freshmal spreadsheet and Automate CV Drive folder must be shared with the service account as Editor.

## Safety switch

Keep repository variable `AUTOMATION_ENABLED=false` until all controlled tests pass. The scheduled worker checks this variable before it can process applications.

## Connectivity test

`.github/workflows/connectivity-test.yml` is manual-only and read-only for Google resources. It verifies:
1. GitHub OIDC → Google WIF authentication;
2. Freshmal metadata/read access;
3. Drive read access to core source files and Outputs folder;
4. OpenAI API key, billing/model access and Responses API with a tiny request.

It does not modify Freshmal and does not create CVs.

## Optional cover-letter template

`COVER_LETTER_TEMPLATE_FILE_ID` is intentionally blank because Prompt 3 currently contains a placeholder rather than naming one authoritative base cover-letter file. CV-only runs do not need this. Before enabling Make CL in production, select the desired template and set this repository variable.

## Safe activation sequence

1. Keep `AUTOMATION_ENABLED=false`.
2. Run repository unit tests.
3. Run `connectivity-test` manually and require success.
4. Choose one controlled Freshmal row with Abhishek Make CV checked, Make CL unchecked and Web Search unchecked.
5. Run one controlled worker execution and inspect Stage 1/2/3 audit files, final DOCX, rendered page, Drive folder, Application Context and Freshmal status.
6. Test Web Search separately.
7. Configure the cover-letter template and test Make CL separately.
8. Test CV+CL+WS.
9. Only after successful controlled tests set `AUTOMATION_ENABLED=true` to activate the hourly schedule.

Never store API keys or Google credential material in source files, prompt files or Freshmal cells.
