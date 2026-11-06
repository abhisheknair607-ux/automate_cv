# Simple on-open Gmail importer (PR #107)

This is the small alternative to PR #106. **Do not merge both importer implementations.** It keeps Gmail parsing and Sheets sync in existing GitHub Actions. No new Cloud Run Job or copying six Gmail/Sheets OAuth secrets into Google Secret Manager is needed. The Garamaal website continues to run on Cloud Run.

## What it does

1. Authenticated Garamaal opening calls /api/alerts/auto/check.
2. Firestore transaction on garamaalSystem/gmailAutoImportActionsV1 gives one run a 45-minute lease and checks the shared 4-hour cooldown measured from successful completion.
3. Backend dispatches the existing linkedin-alerts-to-taaza.yml with its already-authorised GitHub repository secrets; initial range 7 days, later catch-up up to 90.
4. Python importer deduplicates against the existing Taaza Jobs and intake tabs and within the batch; workflow syncs validated jobs to Taaza Jobs after import.
5. Temporary browser status checks query /api/alerts/auto/status. The backend checks GitHub's unique run name and only records success after GitHub concludes success. When successful, the UI refreshes Discovery plus dashboard counters.
6. Failed runs do not advance the four-hour cooldown; a ten-minute retry backoff applies. Existing saved jobs, application statuses, CV generation and Fresh Maal are unaffected.

**Important:** This is an app-open trigger, not a fixed four-hour schedule. No one opening the app means no new import starts. The separate existing master sync scheduler is unchanged.

## Release

1. Check PR #107's CI. It is based on main and intentionally does not activate imports until flag enabled.
2. Confirm the website Cloud Run identity has Firestore read/write access to garamaalSystem and that the existing GITHUB_WORKFLOW_TOKEN secret reference is available to its runtime. This is the *website* token, not any browser token.
3. Merge PR #107 only (not PR #106).
4. In Google Cloud Shell, run:

       cd ~/automate_cv
       git switch main
       git pull --ff-only origin main
       bash standalone/deploy-garamaal-production.sh --plan
       bash standalone/deploy-garamaal-production.sh --release

   This script checks the currently approved production configuration, deploys a zero-traffic canary, verifies and promotes with rollback checks. Stop on error.
5. Once the website is healthy, enable ONLY this feature:

       gcloud run services update automate-cv-dashboard \
         --project=abhishek-cv-automation --region=europe-west1 \
         --update-env-vars=AUTO_ALERT_IMPORT_ENABLED=true

6. Sign into https://garamaal.web.app/prototype . Verify precisely one GitHub workflow named "Garamaal auto import [<run-id>]" starts at https://github.com/abhisheknair607-ux/automate_cv/actions/workflows/linkedin-alerts-to-taaza.yml .
7. On workflow success check Taaza Email Alerts, Email Import Log and Jobs Master; revisit Discovery and verify the new items, without duplicate inserts. Open again inside four hours and verify no second import. A completed run with 0 new jobs is valid if no new unique alerts exist.

## Rollback

       gcloud run services update automate-cv-dashboard \
         --project=abhishek-cv-automation --region=europe-west1 \
         --update-env-vars=AUTO_ALERT_IMPORT_ENABLED=false

Do not disclose secrets, OAuth tokens, GitHub token or Gmail message contents in logs shared externally.
