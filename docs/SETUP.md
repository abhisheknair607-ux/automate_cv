# Setup checklist

The production worker remains intentionally gated until controlled runtime tests are complete.

## Authentication

### OpenAI
GitHub Actions secret:
- `OPENAI_API_KEY`

Repository variable:
- `OPENAI_MODEL=gpt-5.6-sol`

Never store the OpenAI key in source code, Freshmal, Drive prompt files or repository variables.

### Google — hybrid WIF + user OAuth
The repository keeps Workload Identity Federation for keyless Google Cloud/service-account authentication and also uses the authorized Google user OAuth credentials for Drive/Sheets operations that need user-owned storage quota.

Repository variables:
- `GCP_WORKLOAD_IDENTITY_PROVIDER=projects/597435070079/locations/global/workloadIdentityPools/github-actions/providers/automate-cv-github`
- `GCP_SERVICE_ACCOUNT=cv-automation@abhishek-cv-automation.iam.gserviceaccount.com`

GitHub Actions secrets:
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REFRESH_TOKEN`

The OAuth refresh token must have the Drive and Sheets scopes used by the worker. Never commit the OAuth values.

## Freshmal layout

Shared job fields:
- A Company Name
- B Designation
- C Application Link
- D Job Description
- AG Location (optional; folder naming only)

Pooja:
- E Make CV
- F Make CL
- G Web Search
- K Status
- W:AF hidden workflow state

Abhishek:
- H Make CV
- I Make CL
- J Web Search
- L Status
- M:V workflow state

The code can produce two independent candidate work items from one Freshmal row.

## Abhishek profile variables
Configure/retain the verified Abhishek IDs as repository variables:
- `PROMPT1_FILE_ID`
- `PROMPT2_FILE_ID`
- `PROMPT3_FILE_ID`
- `SUMMARY_DOC_FILE_ID`
- `CV_FORMATTING_MASTER_FILE_ID`
- `BASE_CV_FILE_ID`
- `HIGH_EXPERIENCE_REFERENCE_FILE_ID`
- `LOWER_EXPERIENCE_REFERENCE_FILE_ID`
- `CV_COVER_LETTER_RULES_FILE_ID`
- `COVER_LETTER_TEMPLATE_FILE_ID` when used
- `FINAL_PROJECTS_FOLDER_ID`
- `PROJECTS_FOLDER_ID`

## Pooja profile variables
Before ticking Pooja Make CV in production, populate Pooja's own IDs as documented in `docs/POOJA_SETUP.md`. Missing required configuration fails before an OpenAI stage starts.

## Safety/efficiency variables
Recommended initial production values:
- `STAGE1_REASONING_EFFORT=medium`
- `STAGE2_REASONING_EFFORT=medium`
- `STAGE3_REASONING_EFFORT=medium`
- `STAGE1_MAX_OUTPUT_TOKENS=12000`
- `STAGE2_MAX_OUTPUT_TOKENS=16000`
- `STAGE3_MAX_OUTPUT_TOKENS=24000`
- `MAX_APPLICATIONS_PER_RUN=5`
- `MAX_RETRIES=2`
- `MAX_ROW_ATTEMPTS=3`
- `STALE_LOCK_MINUTES=180`
- `COST_HARD_STOP_USD=1.75`

Keep reasoning at medium initially. Lower it only after real per-stage telemetry and output comparisons demonstrate that quality is unchanged.

## Safety switch

Keep repository variable `AUTOMATION_ENABLED=false` until the controlled end-to-end Abhishek test on the merged A–E code passes. The scheduled worker is defined at minute 17 of every hour but the job is skipped while this variable is false.

## Controlled test

`controlled-cv-test` accepts:
- a Freshmal row number;
- candidate: `abhishek` or `pooja`.

Recommended activation sequence:
1. Keep `AUTOMATION_ENABLED=false`.
2. Require repository CI/unit tests to pass.
3. Run one controlled Abhishek CV-only job using a fresh eligible row.
4. Confirm the Drive hierarchy is `Outputs/Abhishek/Company/Designation, Location/` (or designation only when AG is blank).
5. Confirm the final CV, `stage1.md`, `stage2.md`, `stage3.md`, `run_manifest.json`, `Token_Usage.json`, `Factual_QA.md` and `Application_Context.md` are present.
6. Confirm Freshmal status/link/cost/state fields are correct.
7. Test a controlled resume by causing/fixing a Stage 3-side issue without changing the JD/prompts and verify Stage 1/2 checkpoints are reused.
8. Test Web Search separately.
9. Configure/test Cover Letter separately, then CV+CL+WS.
10. Only after successful controlled tests set `AUTOMATION_ENABLED=true`.
11. Add Pooja's source IDs and run the Pooja isolation tests before using her production controls.

## Hourly behavior

The hourly worker:
- does nothing paid when no candidate work item is eligible;
- does not rerun terminal manual/configuration errors automatically;
- bounds retryable row attempts;
- reclaims stale locks;
- continues other candidate work even if one candidate application fails;
- reuses valid Stage 1/2 Drive checkpoints where hashes still match.

Never store API keys or Google credential material in source files, prompt files or Freshmal cells.
