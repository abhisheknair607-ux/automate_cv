# Automate CV: Standalone Dashboard Migration

**Status: Code and automated parity tests are ready. NOT LIVE.**

This is a hosting and sign-in change, NOT a rebuild of the user interface,
the job data, the CV workflow, or the Apps Script feature logic.
The original webapp/Index.html and webapp/Code.gs stay untouched.
The existing Python worker, GitHub schedules, old Apps Script deployment,
Taaza spreadsheet and Freshmaal spreadsheet are untouched.

## Preserved operations

The new server explicitly supports all 14 original backend operations:
getBootstrap, listJobs, getJob, setNotInterested, addDiscovery,
saveDiscovery, transferJob, bulkTransfer, updateFreshJD, getCopyPrompt,
updateFreshControl, getStats, runCvApiNow and syncDiscoveryMaster.

This preserves candidate isolation (Abhishek/Pooja), all Discovery categories
and newly created tabs, Not Interested hiding/restoring, CV-ready Unapplied,
all current status and selected controls, ranking, tier selection, direct
CV downloads, AH/AI post-CV prompts, automatic category synchronisation
and explicitly confirmed GitHub CV dispatch.

## How it works

- The original UI is served from Cloud Run without any visual redesign.
- The tiny standalone/bridge.js adapts existing google.script.run requests.
- Firebase Authentication remembers the selected authorised Google account
  across Chrome sessions, independently of other signed-in Google accounts.
- The new server validates the Firebase ID token and an email allowlist.
- Cloud Run service-account credentials, not Chrome account cookies, read
  and write the two existing spreadsheets.
- The Apps Script business rules execute through a Google Sheets adapter.
- GitHub CV schedulers still run independently, untouched.
- Cloud Run uses 0 minimum instances, 1 maximum, 1 concurrent request,
  512 MiB memory to minimise usage fees. Google Cloud billing is needed;
  actual charges are not guaranteed to be zero.

## Pilot safety gate (before any live cutover)

The first Cloud Run deployment uses APP_READ_ONLY=true by default.
The server rejects ALL write and paid-dispatch operations in this mode.
Read-only endpoints also suppress the original automatic Jobs!P sync so
opening the pilot cannot alter the production spreadsheets.

Start with Viewer access to both existing sheets. Do not run manual CV
generation from the pilot. Then test changes with separate, dated working
copies of Taaza and Freshmaal, NEVER with the live sheet IDs. Only after
both users approve the copy-based tests should the new service be allowed
to write to the production spreadsheets.

See [the full acceptance checklist](ACCEPTANCE.md) before switching.

## One-time authorisations (user)

1. Open Firebase Console, add Firebase to the chosen Google Cloud project,
   enable Authentication > Google sign-in, register a Firebase Web app,
   and copy the Firebase web app ID and public API key.
2. Enable Cloud Run billing and deploy permissions on that project.
   Create a dedicated Cloud Run runtime service account and share both
   Taaza and Freshmaal Google Sheets with its email as Viewer for the
   initial read-only pilot. Use Editor access only on later staging copies.
3. In Google Cloud Shell, clone the migration branch and set the following
   environment variables to your own information:
   GOOGLE_CLOUD_PROJECT, FIREBASE_WEB_API_KEY, FIREBASE_WEB_APP_ID,
   CV_RUNTIME_SERVICE_ACCOUNT and ALLOWED_EMAILS.
   ALLOWED_EMAILS is the comma-separated list of candidate emails.
   Then run: bash standalone/deploy.sh
4. Copy the deployed Cloud Run hostname and register it under Firebase
   Authentication > Settings > Authorized domains. Visit the new URL.
5. To retain the manual Run CV Now button, configure the existing
   GitHub Actions dispatch token in Google Secret Manager and bind it
   to Cloud Run as the GITHUB_WORKFLOW_TOKEN environment secret.
   Never store this token in the browser, a source file or a GitHub commit.

The Firebase API key is public client configuration, not a secret.
Do not paste personal GitHub tokens, Google refresh tokens or API keys
for OpenAI into the ChatGPT conversation.

## Cost safeguards

Set a Google Cloud Billing budget alert (e.g. a EUR 2 or EUR 5 threshold)
before enabling billing. Low-traffic personal usage may fit within free
allowances, but image builds, Artifact Registry storage and other cloud
services can incur charges. The deployment script chooses scale-to-zero
and caps instances. No extra scheduled backend checks are introduced.

## Acceptance tests BEFORE decommissioning Apps Script

- Login as Abhishek and Pooja in the SAME normal Chrome profile.
- Confirm the original styling, navigation and mobile responsiveness.
- Confirm master, TP Europe, Pooja Europe, new tab and renamed tab filters.
- Confirm both candidates' Not Interested choices remain independent.
- Confirm Not Interested hides jobs during casual browsing and Restore works.
- Confirm Freshmaal application statuses, tiers, checkboxes and ranking.
- Confirm CV-ready Unapplied filter, CV download and AH/AI Copy Prompt.
- Confirm JD editing, candidate-safe transfer and duplicate detection.
- Confirm GitHub manual dispatch only after separately authorising a test;
  don't incur OpenAI charges merely to verify the browser migration.
- Confirm scheduled GitHub jobs still run, with downstream outputs verified.

The existing tests are isolated and DO NOT verify live cloud permissions.
A successful GitHub test run is not proof of a working live migration.

## Rollback and work safety

Keep the original Apps Script deployment and GitHub Pages dashboard
operational until BOTH candidates finish live acceptance tests.
To roll back, stop using the new Cloud Run URL. Nothing in the old
Python workflow, Google Sheets or original Apps Script needs rebuilding.
Do not merge this branch into main until live parity is demonstrated.
