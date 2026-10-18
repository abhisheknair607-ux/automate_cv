# Social Hub V2 — Firebase / Freshmaal integration

Status: **feature branch; NOT deployed**. Keep the CV automation and original Apps Script compatibility source unchanged.

## App architecture
- Existing Firebase Hosting site `garamaal.web.app` proxies to Cloud Run service `automate-cv-dashboard`. Social is a new `/social` route in the **standalone Firebase/Cloud Run app**. The Jobs page gets a small `👥 Social` link.
- `standalone/social.html`: compact Dashboard, Swipe, Follow-ups, Research Inbox; authenticated by existing Firebase `bridge.js`.
- `standalone/social_store.js`: Google Sheets/Drive API storage. **No LinkedIn scraping or automatic messaging**. No OpenAI API generation or cost.
- `Connections!A:L`: existing 12 columns retained EXACTLY. Includes existing vacancy-related contacts. Social reads relevant candidate records including the existing `Pooja Krishna Tirupati` spelling. New manual imports append rows using `Applied-for Role=Networking` with the job row and vacancy blank.
- `SocialTracking!A:K`: **new sheet tab created on first successful status/import write only**; per-candidate contact key, status, request/accept/follow-up dates, next follow-up, department, city, contact type, update date. Do not update `Sheet1` or the CV automation controls.
- Research Inbox: two separately permissioned Google Drive folders, one for each candidate. `NEW_*.txt` captures submitted LinkedIn page/search URLs and optionally copied visible text. No profile extraction from link alone. After user reviews contacts and the backend successfully writes + reads them back from `Connections`, the source file is renamed `USED_*.txt`. On failure it remains `NEW_`.
- ChatGPT research prompt copies instructions to process the user's **connected Drive** folder `NEW_` text files, verify public evidence, append only verified people to `Connections`, then rename source after successful verification. This is a user-driven workflow, not an invisible background agent.

## Required Cloud Run environment and permissions
- `SOCIAL_ABHISHEK_EMAIL`: exact Google sign-in email for Abhishek
- `SOCIAL_POOJA_EMAIL`: exact Google sign-in email for Pooja
- `SOCIAL_INBOX_ABHISHEK_FOLDER_ID`: a private dedicated Drive folder ID for Abhishek's TXT files
- `SOCIAL_INBOX_POOJA_FOLDER_ID`: a different private dedicated Drive folder ID for Pooja's TXT files
- The Cloud Run service account needs editor access to Freshmaal and editor/content-manager access to each appropriate private Drive folder. Do **not** make research folders public.
- Preserve the existing `APP_READ_ONLY`, `APP_ALLOW_PRODUCTION_WRITES`, `ALLOW_MANUAL_CV_DISPATCH`, `ALLOWED_EMAILS`, existing Sheets IDs, Firebase auth, and the GitHub workflow secret; do not reset any of them. Social writes obey the existing read-only gate. The app fails closed if the candidate-email identity mapping is missing or an unauthorised account opens Social.
- Added Google OAuth service-account scope: `drive.file` for creating/managing app-created TXT files. Existing `drive.readonly` and `spreadsheets` scopes remain unchanged.
- The generic account's ability to edit the entire Freshmaal sheet remains governed by Google Sheets sharing; the Social HTTP interface itself enforces candidate mapping. Do not launch publicly with a shared unrestricted sheet.

## Important limitation
The GitHub default `main` branch as inspected on 18 October 2026 **does not contain the Firebase/Cloud Run `standalone/` directory or `firebase.json`**. It exists on separate migration/feature branches. The Social branch was created from `fix/firebase-garamaal-status-contacts-20261016`. Merge it into the appropriate current Firebase release branch first, *not blindly into `main`*, until the source of the deployed Cloud Run revision is independently verified.

## Acceptance checks
1. Run `npm test`, the standalone parity workflow and `node --check standalone/social_store.js`; smoke test the container, unauthenticated `/api/social/data` (401), and authenticated candidate mismatch (403).
2. On **staging copies** of Freshmaal and private test Drive folders, load existing A:L contacts and confirm the candidate counts and correct Pooja name matching. Test that reading creates no tabs or writes.
3. Swipe right only after a real request was sent; inspect `SocialTracking` row, reload and ensure persistence. Swipe left moves to Later, no repeat in queue. Test status accepted, copy and record follow-up, and candidate isolation.
4. Import a test contact, verify its A:L row, check its department saved in `SocialTracking` (not `Sheet1`), repeat import to confirm no duplicate.
5. Paste a LinkedIn company URL into Research Inbox, save `NEW_*.txt`, test copy research prompt. Import a verified person from the source, verify `USED_*.txt` rename. Simulate Sheets failures; the file must remain `NEW_`.
6. Run Jobs UI regression for candidate switch, vacancies, CV flags, ranking, costs and connections; **never trigger paid CV generation as a test**.
7. Confirm the live Cloud Run service identity and Firebase rewrite before production deployment; snapshot current revision, preserve secrets and deployment flags, then use the existing `standalone/deploy-live-update.sh` release checks. Verify `https://garamaal.web.app/social` after deployment, and perform read/write smoke tests only with approved test records.

## Notes
- Contact messages from existing Freshmaal data display unchanged. New imports with no saved message receive simple role-aware draft templates in the browser; AI enrichment is through user-controlled ChatGPT prompts.
- Status and sender detection are manual. Gmail forwarding and LinkedIn messaging integration are not part of this deployment.
- One email maps to one candidate. Other registered accounts and public SaaS access require a future Firebase/Google Sheets privacy redesign.
