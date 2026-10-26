# Automate CV: Standalone Dashboard Migration

**Status: Code and automated parity tests are ready. NOT LIVE.**

This is a hosting and sign-in change, NOT a rebuild of the user interface,
the job data, the CV workflow, or the Apps Script feature logic.
The original webapp/Index.html and webapp/Code.gs stay untouched.
The existing Python worker, GitHub schedules, old Apps Script deployment,
Taaza spreadsheet and Freshmaal spreadsheet are untouched.

## Compact per-job CV cost and two-candidate expense tracker

No new page, sheet tab, cost model or automation is introduced.

- Every Make CV job card shows a small **USD estimated cost** chip after
  the worker has written a non-blank amount. This comes directly from
  Freshmaal Sheet1 **U (Abhishek)** or **AE (Pooja)**; the two columns
  remain independent.
- A small **$** button in the existing header opens an on-demand compact
  popover with Abhishek's recorded total, Pooja's recorded total, their
  combined total, count of costed jobs, and a compact recent-cost list.
  It works from either candidate view without adding more page height.
- Tapping any recorded job cost asks the authenticated Cloud Run service to
  find that candidate's **Token_Usage.json** in the exact saved application
  output folder. Only then is Drive queried, and a **verified direct Drive
  file link** is returned. The application ID, candidate, and estimated USD
  amount are checked against Freshmaal; any mismatch is clearly reported.
  Token model/stage estimates are included in the on-demand detail.
- Aggregation is performed from previously stored worker estimates, not
  by rereading hundreds of JSON files or guessing token use. Summation
  uses integer USD ten-thousandths (Freshmaal rounds each saved amount to
  four decimals).
- **Accounting limitation:** The JSON file states that costs are
  **estimates** from response token usage, the worker's configured model
  prices and counted tool activity. Provider invoices are authoritative.
  Historical jobs lacking stored costs, unsuccessful paid attempts, and
  older overwritten reruns may be absent from the stored totals. The
  interface must never label this as complete billing or silently treat
  a blank cell as $0.00.
- Expense summary requests use the cached Freshmaal list; no additional
  scheduled polling or external billing API is added. The per-job
  proof route validates Firebase sign-in and the same candidate/row before
  inspecting Drive, and never exposes bearer tokens.

Deploy once, **after** both this change and the prior violet/theme,
Favorites, scrolling, ranking and JD-auto-transfer changes have been merged
into `migration/standalone-google-auth-no-appscript`:

```bash
git clone --branch migration/standalone-google-auth-no-appscript --single-branch https://github.com/abhisheknair607-ux/automate_cv.git garamaal-release
cd garamaal-release
bash standalone/deploy-live-update.sh
```

After deployment, on the Garamaal Dashboard click **Set up Sheets
preference dropdowns** once, then refresh and test each candidate's
favorite, cost badge, $ tracker, and one on-demand usage-file link.
Do not run `standalone/deploy.sh`, deploy Apps Script, or manually
generate paid CVs just to test the tracker.

## Garamaal candidate preferences, ranked cards and JD auto-transfer (October 2026)

This change targets the **Firebase Hosting → Cloud Run** Garamaal site,
not an Apps Script deployment.

- Switching to **Pooja** applies a violet/lavender theme to Dashboard,
  Discovery, Make CV and Add Job. Switching to Abhishek retains blue.
- Designation and company name in every vacancy card link safely to the
  original HTTPS/HTTP vacancy in a new browser tab.
- Each Make CV card presents **Profile Fit**, **Career Fit**, **Avg 55/45**
  and **Rank** in one compact strip. Avg is the existing candidate-specific
  weighted score in AL/AN, and Rank is the existing AM/AO rank formula.
  The new manual component-score columns AX/AY (Abhishek) and AZ/BA
  (Pooja) stay blank until individually verified scores are supplied.
  The app must show “—” rather than reconstruct component scores.
- Discovery and Make CV offer **Favorites ★** alongside the current filters.
  All filter and sort chips share a single horizontally scrollable row.
- The candidate's preferences in Taaza Jobs!N/O and Freshmaal Sheet1!AT/AU
  are **blank / Not Interested / Favorite**. Existing TRUE/FALSE flags
  are interpreted safely until the new dropdown migration completes.
  Each preference edit syncs all matching URL rows across both Sheets.
  Favorites are visible in normal lists; Not Interested remains recoverable.
- Saving a **complete JD through Garamaal** now automatically transfers
  newly discovered jobs into Freshmaal (without selecting any paid
  Make CV/CL controls). Already-existing Freshmaal JDs and generated
  documents are preserved. Saving direct changes in Google Sheets is not
  an instantaneous Garamaal Save event; its existing worker behaviour is
  unchanged.

### Safe live rollout

1. Confirm the feature branch's full GitHub tests and standalone parity
   suite succeed, then merge into the migration branch.
2. In authenticated Google Cloud Shell, clone/pull
   `migration/standalone-google-auth-no-appscript` and run
   `bash standalone/deploy-live-update.sh`. The script preserves live
   secrets, approved identities and production write settings.
3. At `https://garamaal.web.app`, open the Dashboard and click
   **Set up Sheets preference dropdowns** once. Confirm the conversion.
   The migration preserves existing rejected jobs, changes old Boolean
   flags to “Not Interested,” and configures blank / Not Interested /
   Favorite choices without touching CV generation or ranking formulas.
4. Check both candidates, mark/restore/favorite one test vacancy, and
   save a new complete JD. Verify the vacancy appears only once in
   Make CV, without Make CV/CL checkboxes being automatically enabled.

Do not run `standalone/deploy.sh` on production: that pilot setup script
resets live authentication and read/write configuration. GitHub merges
alone do not update the Cloud Run service.

## Google Sheets 429 read-quota mitigation (15 October 2026)

The Firebase Hosting URL `https://garamaal.web.app` forwards to the existing
Cloud Run `automate-cv-dashboard` service in `europe-west1`. It does not
call the old Google Apps Script web-app deployment. The Cloud Run Node runtime
still executes the shared `webapp/Code.gs` business rules through the
`standalone/runtime.js` compatibility layer; editing `Code.gs` in this branch
therefore **does** affect Cloud Run after deployment, but requires no Apps
Script deployment.

- The independent 20-minute GitHub regional-to-master synchroniser updates
  the existing `Jobs` rows and `Jobs!P` category membership.
- Garamaal no longer repeats that multi-tab sync on startup, search,
  Discovery refresh or dashboard statistics.
- Read-only list projections from the Taaza and Freshmaal spreadsheets are
  cached for 30 seconds in Cloud Run; tab metadata is cached for 4 minutes.
  Full JD and CV prompt text is not stored in this shared list cache.
- All app-side mutations invalidate list caches; direct spreadsheet edits may
  take up to 30 seconds to appear. A tab renamed immediately before the
  scheduled sync uses a narrow fallback when necessary.
- Rapid search requests are debounced; duplicate quick-filter fetches are removed.
  A Google Sheets 429 now displays a short retry message instead of raw JSON.

After the approved migration-branch changes pass CI, deploy **only** the
existing Cloud Run service from the updated migration branch using:
`bash standalone/deploy-live-update.sh` in an authenticated Google Cloud Shell.
This production-safe script first verifies its live service-account, spreadsheet
IDs, edit gates and GitHub secret, and preserves them during the source update.
Do **not** run `standalone/deploy.sh` against the existing live service, because
it is the original read-only pilot installer and replaces runtime settings.
Firebase Hosting rewrite and Firebase Authentication settings do not need
changes for this code update. GitHub merges alone do not publish live code.

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
- Download CV / CL asks the same-origin authenticated server for the file link
  in that candidate's Freshmaal row. The server reads the DOCX from Drive and
  returns it as an attachment; Open CV / CL still uses the saved Drive view link.
- The Cloud Run runtime service account needs Viewer access to the existing
  output folder (and inherited access to its DOCX files). Its OAuth scope now
  includes Drive read-only. No Drive token or file ID is sent to the browser
  for downloads, and no CV/CL generation is involved.
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


## Consolidated Garamaal release: ranking, insights, Connections (October 2026)

This release **builds on** all previously merged changes in
`migration/standalone-google-auth-no-appscript`, including the Google
Sheets 429 mitigation, compact cards, click-to-open vacancy job titles,
Discovery pagination/scroll preservation, hiding already-transferred jobs,
and Discovery bulk Favourite / Not Interested (no bulk transfer).

### Dashboard: Ranking prompt (no ranking API calls)

- **Copy ranking prompt** uses candidate-specific *exact* URLs for the
  relevant Summary Doc, Ultimate Career Goal and Rank - Job scoring guide.
  It instructs ChatGPT with connected Google Drive/Sheets access to score
  only previously-unscored Freshmaal jobs, retaining all historical combined
  scores and recalculating rank across *all* scored jobs using the existing
  55% Profile Fit / 45% Career Fit calculation. Keyword coverage is separate.
- During that same JD pass, extract JD-stated named contacts, visa sponsorship
  (YES/NO/NOT STATED) and salary thresholds (EUR/GBP, annual base only).
  Store row-verified supporting excerpts in **Sheet1 BB–BD**. It may backfill
  *missing clues* on old scored jobs without rescoring them.
- For any named person explicitly present in the JD, the ranking prompt
  also instructs ChatGPT to create/upsert an entry in the *separate*
  Freshmaal `Connections` tab, with a LinkedIn people search and
  no invented direct-profile link. Such external ChatGPT edits require
  connected Sheets write permission; no background claim of success.
- The optional **Fix rank formulas** button is a separately confirmed
  Sheets API `USER_ENTERED` write to `AM3:AM1000` and `AO3:AO1000`,
  **not** the combined-score columns. Do not use until reviewing historical
  formula repair implications. This action does not run automatically.

### Make CV card, Contacts, and JD clue eye

- Completed CV cards use **icons only**, with accessible labels/tooltips:
  download CV, copy prompt, reject, favourite, chain-link Connections, more.
  Cover letter download remains in the job's detail view.
- The chain-link button requires that job's **Web checkbox** be saved.
  Checking Web opens the Connections popup to select **1–5 / 5–10 / 10–15**
  contacts. It **does not** automatically make a paid API call.
- Popup displays cost *estimates*: roughly $0.06 / $0.11 / $0.15 for the
  three tiers, $0.15 target and $0.20 *planned* cumulative per-job ceiling.
  Actual provider billing is not guaranteed: varying tool/search token usage
  and Cloud Run restarts can change totals. The Node worker performs at most
  **one** OpenAI Responses API request with **one** web-search call and **no
  automatic retries** per click; cached or sheet-saved findings are reused.
  No API key means paid research is unavailable; free LinkedIn category
  searches and a candidate-specific Copy ChatGPT research prompt remain.
- After successful opted-in paid research, named people are written
  *idempotently* to a separate Freshmaal **`Connections` tab** (created
  on first successful save, never by modifying Sheet1) with exactly:
  `Company`, `Contact Name`, `Direct LinkedIn Profile`,
  `LinkedIn Search`, `Applied-for Role`, `Candidate`,
  `Freshmaal Row`, `Vacancy Link`, `Person's Position`,
  `Verification / Evidence`, `Outreach Message`,
  `Research Date (UTC)`.
  Each saved person is keyed by candidate + row + vacancy URL + name.
  Direct profile URLs require an actual cited LinkedIn profile, otherwise
  remain blank; search links and outreach messages (≤300 characters) are
  retained. A stored shortlist satisfying the chosen count is returned
  without a second paid research call.
- The small golden eye appears **after CV generation** when BB–BD contains
  a qualifying contact, affirmative sponsorship or annual salary strictly
  above €50,000/£50,000. Clicking it shows JD evidence rather than guessing;
  the user may explicitly save rule-based extracts where ranking has not
  yet populated the columns. Additional BB–BD columns are created only
  after checking for conflicts, and unrelated Sheet1 data is preserved.

### One cumulative deployment

Do **not** deploy the older Apps Script version. After GitHub CI has passed
and the final release PR is merged into
`migration/standalone-google-auth-no-appscript`, run **once** in
Google Cloud Shell (project `abhishek-cv-automation`):

```bash
cd ~
git clone --branch migration/standalone-google-auth-no-appscript --single-branch https://github.com/abhisheknair607-ux/automate_cv.git garamaal-final-release
cd garamaal-final-release
bash standalone/deploy-live-update.sh
```

The script verifies and preserves the existing Cloud Run production
configuration; Firebase Hosting remains `https://garamaal.web.app`.
Do not run `standalone/deploy.sh`. To **enable paid** networking research
later, configure a Google Secret Manager-backed `OPENAI_API_KEY` environment
secret for the same Cloud Run service separately. Never paste an API key into
GitHub source, the public website, or this README.

The code can be deployed with no paid networking key; the cost-free prompt
and LinkedIn search functions remain operational.
