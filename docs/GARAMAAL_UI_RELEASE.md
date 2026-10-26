# Garamaal Stage 16 production UI integration

Release source: `f7081c8b8ca666058f464bf729b27f6e1f33cb06` (QA-passed Jobs UI and reversible homepage flag).

This integration is additive to `main`: the Python CV worker (`src/`, `prompts/`, `Dockerfile`, `requirements.txt`) and current source `webapp/` are unchanged.

Standalone UI is copied verbatim from the tested release to `standalone/`. The matching tested HTML and Apps Script source are frozen independently in `garamaal-release-webapp/` to avoid replacing main's more recent `webapp/` sources. `Dockerfile.garamaal-ui` builds the exact paired standalone UI sources. Do not deploy from `Dockerfile.standalone` on `main` (absent by design). Production Cloud Run/Firebase deployment is a **separate guarded action**, not a side effect of merging GitHub code.

Env switch: `GARAMAAL_UI_V3=true` makes `/` redirect to `/prototype` (QA-tested UI). `GARAMAAL_UI_V3=false` restores original `/`, and `/legacy` always serves the previous authenticated Jobs interface. Do not change other production environment settings or secrets. No Salesforce/Firestore migration.

Release guard: preserve current Cloud Run service account, Google Sheets IDs, GitHub secret, `APP_READ_ONLY=false`, `APP_ALLOW_PRODUCTION_WRITES=true`, `ALLOW_MANUAL_CV_DISPATCH=true`, CV worker image/Cloud Run service, and existing Firebase routing. Inspect Social `/social` independently; this UI PR updates Jobs but does not replace the Social backend. Deploy new Cloud Run revision with 0% traffic; smoke test tagged revision and rollback with saved revision traffic before 100%.
