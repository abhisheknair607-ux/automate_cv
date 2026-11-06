# Garamaal automatic importer (on-open; no GitHub scheduler)

Staged on the `feature/app-open-import-four-hour` branch. Existing production is unchanged until the dedicated Cloud Run Job, Secret Manager bindings, IAM roles, and website revision are configured and deliberately promoted.

## Trigger & safety

- Successful Google sign-in causes `POST /api/alerts/auto/check`. A returning visible tab can repeat the check. The backend enforces a shared four-hour interval from `lastSuccessAt`.
- Firestore document `garamaalSystem/gmailAutoImportV1` is the central transaction-locked state. The app server never reads or writes the Gmail credential values.
- An eligible open starts the dedicated `garamaal-alert-importer` Cloud Run Job. The job runs Python `linkedin_alert_import.run(...)`, `taaza_sync.sync_once(...)`, and the read-only duplicate proposal analyzer.
- Only after the master write and verification completes does the job record `lastSuccessAt`. Failure means no timestamp advancement; retry backoff 10 minutes; expired lease 45 minutes.
- Duplicate proposals are stored for a compact popup. No automatic `Jobs!Q` updates or deletions. Ingestion automatically skips exact identifiers, retaining both existing job data and candidate statuses.
- `AUTO_ALERT_IMPORT_ENABLED` defaults to off. `APP_READ_ONLY` and `APP_ALLOW_PRODUCTION_WRITES` still gate all production use.
- No CV generation, AI API or ranking runs are involved.
- First run scans seven days; catch-up scans up to 90 days after long absences. Older than 90 days requires a separate controlled backfill.

## Cloud configuration for cutover

Required resources:
1. Existing Google Cloud project `abhishek-cv-automation` in `europe-west1`. Firestore native database is already present.
2. A Cloud Run Job called `garamaal-alert-importer`, built from `Dockerfile.garamaal-importer`, timeout ~15 minutes, max retries 0, one task, with the Python source from this release.
3. Run-job service account with Firestore data read/write, Sheets access to Taaza, and Secret Manager access to **existing authorised Gmail OAuth refresh-token/ID/secret** and optional Sheets OAuth fallback credentials. Secrets are copied securely to Secret Manager, not committed to GitHub.
4. Job env `GARAMAAL_ALERT_IMPORT_APPROVED=true`, `TAAZA_SPREADSHEET_ID=1jt3WXqpnzVOYcKCpABIp-7UMUPr48kVhMkLfzGEHHZY`. Its `GARAMAAL_AUTO_RUN_ID` comes only from a signed server override.
5. Website service account: Firestore data permissions and `run.jobs.runWithOverrides` permission scoped to that one job (the predefined `roles/run.jobsExecutorWithOverrides` role, if available for the project).
6. Website Cloud Run env: `AUTO_ALERT_IMPORT_ENABLED=true`, `AUTO_ALERT_IMPORT_JOB=garamaal-alert-importer`, `AUTO_ALERT_IMPORT_REGION=europe-west1`, and the existing production write gates remain unchanged.

## Release sequence (do not skip gates)

1. From the tested `feature/app-open-import-four-hour` branch, run `bash standalone/deploy-app-open-import.sh --plan`. It checks existing Secret Manager names without changing resources. Do not display or paste credential values.
2. Run `bash standalone/deploy-app-open-import.sh --prepare` from that same clean feature branch. This provisions the dedicated Cloud Run Job, its service identity and scoped permissions **without activating app-open imports or changing website traffic**. No real Gmail import is executed.
3. Confirm the Cloud Run Job exists and can be invoked only by the authorised website service account; verify Gmail readonly and Sheets OAuth secrets and the expected Taaza spreadsheet access.
4. Only then merge the tested PR; use the guarded website canary deployment procedure with `AUTO_ALERT_IMPORT_ENABLED=false`. Confirm the original CV and application workflows still work.
5. Enable `AUTO_ALERT_IMPORT_ENABLED=true` after website verification. Open the signed-in app once, wait for Cloud Run success, and verify Email Alerts, Jobs, and authenticated Discovery readback. A second opening within four hours must not launch another job.
6. On failure, immediately set `AUTO_ALERT_IMPORT_ENABLED=false`; manual master sync stays available as fallback. Do not re-enable GitHub scheduling merely as a side effect of rollback.

After a successful import, the web page briefly checks the **status of that active run only** and refreshes Discovery plus dashboard counts. This completion check cannot dispatch an import. There is no recurring background Gmail polling or browser-side four-hour timer.

## Cutover verification

- Disable/remove GitHub schedule `taaza-master-sync.yml` **after** the new system is ready and verifying. Its workflow remains manually runnable for rollback only.
- A signed-in app open starts only one job even across two separate users or tabs. Before four hours, no job starts.
- Verify new alert job links in Email Alerts, then master Jobs; source preserves `Needs Review` flags, existing `N/O/Q` values and all Freshmaal records.
- Check `/api/alerts/auto/status` after job finish, refresh Discovery, and inspect duplicate-only popup. No popup should open automatically.
- Roll back by setting `AUTO_ALERT_IMPORT_ENABLED=false`; re-enable manual sync only if needed.

Deployment must not proceed until the job can access live Gmail and Sheets credentials, Firestore and the job-run IAM permission. Never use the GitHub Actions token for this importer.
