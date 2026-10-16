# Freshmaal — Job Control Centre

**Standalone mobile-first Google Apps Script web application.**

It sits on top of the existing Google Sheets and CV automation; it does not change their architecture or require an OpenAI API for job ranking or webapp actions.

## Existing production sources (verified 12 October 2026)

| Purpose | Google Sheet | Tab | Details |
|---|---|---|---|
| Discovery database | [Taaza Videshi Maal](https://docs.google.com/spreadsheets/d/1jt3WXqpnzVOYcKCpABIp-7UMUPr48kVhMkLfzGEHHZY/edit) | `Jobs` | A Company, B Designation, C Link, D Job Description, E Location, K Send to CV Sheet, L CV Sheet Status |
| Application/CV controls | [Fresh Maal](https://docs.google.com/spreadsheets/d/1ltT1gPFcpBdz1Wp_CuxkwFpfkwnnhjL316yVu3gxPCc/edit) | `Sheet1` | A–D vacancy; E–G Pooja controls; H–J Abhishek; K Pooja status; L Abhishek; AG Location; AL–AO scores/ranks; AP/AQ candidate selections |

## Functions already implemented

* One web application for both people. The selected Abhishek/Pooja view is saved separately per browser/device, **not** into a shared Sheet cell.
* Mobile bottom navigation, desktop sidebar, overview dashboard, discovery list, Freshmaal Make CV and an Add Job form.
* Server-side search, filters and sorting with **10 jobs per mobile page and 25 per desktop page**; no need to load or scroll through the entire dataset in the browser.
* Open the original vacancy URL from **Taaza Column C** in a new tab.
* Paste and save a complete JD, replacing **only Taaza Column D of the verified vacancy row**.
* Add new vacancies **to Taaza by default**; optionally **Save & Send** to Freshmaal in the same interaction.
* Transfer a single vacancy or up to 20 selected vacancies to Freshmaal. Before transfer, the JD must be complete; the backend checks for duplicate vacancy URLs.
* Reopen a transferred job and explicitly update Freshmaal's JD from Taaza after confirmation. This is blocked when an existing CV-processing lock is present.
* Read and write **both candidates' actual CV / CL / Web Search checkboxes, application status and selection checkbox** in the original Freshmaal cells.
* Display each person's existing ranking score, rank, CV workflow state, CV/CL links, output folder and last error.
* Wait for successful spreadsheet writes and verify key values before reporting saved; prevent common stale-row and concurrent-editor collisions.

### Field mapping

| Web operation | Actual cells |
|---|---|
| Add/discover | Taaza `Jobs!A:M` in a safe empty row |
| Open vacancy | Taaza `Jobs!C{row}` |
| Save pasted JD | Taaza `Jobs!D{row}` |
| Transfer job | Freshmaal `Sheet1!A:D` and `AG` in a safe empty row |
| Mark successful transfer | Taaza `Jobs!L{row}` (no change to Column K trigger) |
| Abhishek CV / CL / Web | Freshmaal `H / I / J` |
| Pooja CV / CL / Web | Freshmaal `E / F / G` |
| Abhishek / Pooja status | Freshmaal `L / K` (keeps existing dropdown values) |
| Abhishek / Pooja selected | Freshmaal `AP / AQ` |
| Abhishek / Pooja score & rank | Read only `AL:AM / AN:AO` |

**Minimal new preference fields added on 13 October 2026**: Taaza `Jobs!N:O` and Freshmaal `Sheet1!AT:AU` for candidate-specific Not Interested flags, plus the previously introduced Freshmaal model-tier columns `AR:AS`. Original CV controls, statuses, job-description columns and the GitHub CV generation prompts remain unchanged. The web app writes job flags and other controls only after a separate Apps Script deployment and explicit user actions.

## One-time deployment — Google Apps Script

A Google account with edit access to **both Google Sheets** is required. The same is required for the other person if the web app executes as them.

1. From a browser, visit [script.google.com/home/projects/create](https://script.google.com/home/projects/create). A computer is easier, but the browser's Desktop Site mode may work on a phone. Create a **new standalone** project, for example `Freshmaal Job Control Centre`. **Do not open or replace a script bound to your current spreadsheets.**
2. In `Code.gs`, delete the default stub and paste the entire contents of the provided **`Code.gs`** file.
3. Click **+** → **HTML**. Name the file exactly `Index` (Google creates `Index.html`). Paste the entire contents of **`Index.html`**.
4. In the project **Settings → Script properties**, add key `ALLOWED_EMAILS` and set its value to **the two actual Google account email addresses**, separated by a comma. Example format: `account.one@gmail.com,account.two@gmail.com`. No real personal email addresses are hardcoded in the source. The app fails closed until this property is set.
5. Verify that both accounts have **Editor** access to Taaza and Freshmaal. The script accesses these two original spreadsheet IDs; it does not create other spreadsheets.
6. Click **Deploy → New deployment → Select type → Web app**. Choose **Execute as: User accessing the web app**, and **Who has access: Anyone with a Google account** (or an equivalent setting that permits both actual accounts). Deploy, authorise Google Sheets access as prompted, and copy the generated `/exec` web app URL.
7. Open the URL in both accounts. Each account may have to authorise access once. Bookmark or **Add to Home screen** on Android. Both users open **the same URL**, but their preferred candidate toggle remains independent on their devices.
8. Test on an unimportant new vacancy first. Check Taaza Column D after saving its JD, verify the matching row in Freshmaal after transferring, then test Abhishek and Pooja CV checkboxes independently. Confirm the original GitHub worker still reads `Sheet1` unchanged.

The live URL cannot be pre-created by code files alone: **Google requires the owning account to create and authorise the Apps Script deployment.** The provided `Index.html` can be opened locally to explore its **demo mode** before deployment. Demo actions never write to Google Sheets.

## Security and reliability

* The backend restricts access by the **signed-in effective Google user** through required `ALLOWED_EMAILS`. Deployment must be **Execute as user accessing**, not Execute as owner, or the identity check will not distinguish users correctly.
* The Google Sheets remain the only databases. Spreadsheet IDs are in server code, not browser JavaScript; no OAuth credentials or API keys are embedded.
* ScriptLock serialises web-app writes. Every update checks the original company, designation and vacancy URL against the current row. JD replacement additionally checks for edits made by another user since the page was opened.
* Transfer does not overwrite an already-existing matching Freshmaal vacancy, and never changes the old workflow status, locks, context, CV/CL links or rank formula columns.
* Freshmaal new rows are limited to existing rows **3–1000**, which is the range the original CV worker knows about. If there is no safe free row, the operation fails rather than placing a job outside the worker's range.
* The app does **not** calculate AI job-ranking scores, call the OpenAI API, schedule CV generation or repair existing CV-worker Google credentials. It only displays the scores and controls already present in Freshmaal.
* The existing CV worker previously logged an `invalid_grant` refresh-token error. That independent worker may still need reauthorisation to process CVs once checkboxes are ticked.

## Files

* `Code.gs` — Google Apps Script backend (real Google Sheets integration)
* `Index.html` — responsive web app frontend; doubles as standalone, clearly labelled demo
* `README.md` — setup, field mapping, troubleshooting and limits

The source is versioned in the existing `automate_cv` repository under `webapp/` as a **separate overlay**; it is not an active GitHub Actions or Apps Script deployment. The existing CV worker continues to use the same spreadsheet columns and schedule.


## 13 October 2026 additions
- Compact full-width responsive dashboard and multi-column desktop job cards.
- Labels: **Seems Kacha** (JD incomplete), **Seems Taaza** (JD saved and valid), **Seems Fresh** (transfer control), **Garam CV Ready** (existing CV link available).
- Freshmaal model tiers use AR (Abhishek) and AS (Pooja), with Economy, Balanced, Premium. No existing original columns moved.
- Each tier selection writes only one corresponding candidate/job cell; avoid changes during active CV generation.
- Model IDs are resolved by GitHub's src/automate_cv/model_presets.py, not editable directly in Sheets.
- Existing blank model tier resolves to Premium.


## 13 October 2026 — Candidate-specific Not Interested (both sources)

**Purpose:** Each of Abhishek and Pooja can permanently remove irrelevant roles from **their own normal discovery and CV lists**, while retaining a separate recoverable archive visible through the **Not Interested** filter/button. The other candidate's list remains unaffected, including when both are using different phones or computers. This is a preference, **not** a CV-automation status; marking a job Not Interested does not cancel an already requested CV or change the CV/CL/WS checkboxes.

| Sheet/tab | Abhishek flag | Pooja flag | Behaviour |
| --- | --- | --- | --- |
| Taaza `Jobs` | N | O | Candidate-specific discovery exclusion |
| Freshmaal `Sheet1` | AT | AU | Candidate-specific CV/application listing exclusion |

Only these four previously unused columns were assigned to this feature. **No extra Google Sheets tabs or additional data stores.** Both columns use Boolean checkboxes. Existing entries start unchecked, so no jobs disappear on rollout.

Workflow:
1. Switch between Abhishek and Pooja in the same webpage. On **Taaza Discovery** or **Freshmaal Make CV**, click **Not Interested** on a job card or in the job-detail drawer.
2. The backend verifies the source row's company/title/link and takes a script lock. It canonicalises the vacancy URL (removing tracking parameters) and writes the chosen candidate's flag to all matching URL rows in both Taaza and Freshmaal, if present. The other candidate's flag is left exactly as it was.
3. The marked vacancy is removed from the candidate's default All jobs, Missing JD, Ready, Selected, Unapplied, Applied and other normal filters. It appears only in that candidate's dedicated **Not Interested** view (a filter chip on both pages, and direct dashboard shortcuts).
4. From **Not Interested**, use **Restore**. The same backend operation clears that candidate's matching flags in both source sheets and the role reappears in normal results.
5. The same vacancy can legitimately be Not Interested for Abhishek but visible or shortlisted for Pooja. Toggling candidate does not change the other person's underlying checkboxes, statuses, rankings or model preferences.
6. The UI's **Next · Load more** action appends newly fetched jobs below the current cards without jumping to the top. The server accepts an offset to account for jobs hidden/restored while browsing; active search, filters, candidate and sort are maintained.

**Integration notes:** The existing discovery-to-Freshmaal transfer copies N/O to AT/AU for newly transferred roles and clears stale flags when reusing a previously blank input row. A direct checkbox change in either original Sheet is read into the web app and used in effective cross-sheet filtering (a flag in either sheet hides the matching vacancy); using the webpage **Restore** clears both. Duplicate matching vacancy URLs are updated together. There is no extra OpenAI API use, no impact on CV templates/formatting and no changes to the hourly CV-worker schedule.

**Validated locally:** Google Apps Script mocked tests cover cross-sheet updates, URL matching, independent candidate flags, direct-sheet edits, restore, stale-row checks, lock release and pagination offsets. Playwright Chromium UI tests on **390×844 phone** and **1440×900 desktop** cover mark/hide, view/restore, candidate isolation, Unapplied visibility and below-the-list loading. These local validations are **not equivalent to a live Apps Script deployment/authorisation test**. To go live, complete the one-time deployment instructions above.


## Manual 'Run CV Now' button (Google Apps Script deployed dashboard)

The Freshmaal candidate/job cards and detail drawer expose **Run CV Now**. A confirmed click calls a server-side Apps Script function that dispatches the existing GitHub `controlled-cv-test.yml` workflow for precisely the selected Freshmaal row and candidate. The worker reads the previously saved Economy/Balanced/Premium tier from the Sheet; **no OpenAI key is sent to browsers or stored in Apps Script**.

**One-time owner setup (never paste credentials in chat):** create a GitHub fine-grained personal access token scoped ONLY to `abhisheknair607-ux/automate_cv` with repository **Actions: Read and write**, then put the token in **Apps Script → Project Settings → Script properties**, key `GITHUB_WORKFLOW_TOKEN`. Do not confuse this with GitHub's separately stored `OPENAI_API_KEY` secret. Save the updated `Code.gs` and `Index.html` in the existing standalone Apps Script project and deploy a **new version of the existing deployment** (Deploy → Manage deployments → Edit → New version → Deploy). Users may need to reauthorize external-request scope. Changes committed to GitHub alone do NOT update Apps Script's running `/exec` deployment.

Safety rules: access allowlist, confirmation, exact row identity, candidate-specific Make CV and model checks, JD presence, Applied/Not Interested exclusions, existing CV/lock rejection, five-minute duplicate-dispatch cooldown. GitHub HTTP 204 means request accepted, **not** CV creation completed. The OpenAI model and API account require a separate live integration test; no chargeable run is performed as part of this source update.

The manual workflow shares its concurrency group with the scheduled worker and uses GitHub's `queue: max` policy to avoid simultaneous jobs. If GitHub declines or rate-limits the dispatch, the interface displays an error. Do not enter GitHub or OpenAI tokens in the PWA/HTML frontend.

## Multi-tab Taaza discovery and completed-CV actions (14 October 2026)

- **Jobs is the master list.** The `TP Europe` and `Pooja Europe` tabs remain regional subsets. Their missing vacancies are mirrored into `Jobs` using canonical vacancy URLs, deduplicated across all three tabs. No existing master rows or original specialist rows are overwritten.
- The independent scheduled GitHub sync mirrors regional jobs and updates Jobs!P at minutes 13, 33 and 53 (UTC). The dashboard no longer repeats this expensive sync on startup or filter changes. Authorised operators can still run Apps Script `syncDiscoveryMaster()` manually when an immediate mirror is required. Scheduled runs may be delayed.
- New mirrored rows copy A–J and regional Column L; **master Column K is always FALSE** to avoid accidentally re-triggering the CV transfer automation; master Column M notes the source tab. Master candidate-specific Not Interested flags in N/O are preserved for existing rows.
- **Make CV → Unapplied** now displays only roles where the selected candidate has a **generated CV link** and their application status is not `Applied`. A checked Make CV box or a `CV` status alone does not qualify.
- Completed-CV job cards have condensed **Download CV** and, once available, **Copy Prompt** actions directly alongside existing controls; the dashboard does not require the Details drawer. The download opens the original Google Drive DOCX file.
- **Copy Prompt** reads the existing Freshmaal `AH` cell for Pooja and `AI` cell for Abhishek. The button appears only when that candidate has a generated CV link **and** their prompt cell is populated. The full prompt is fetched on demand; it is not embedded in the card HTML or available before generation. The backend re-checks ownership and CV readiness.
- No new data sheets, candidate state changes, scoring changes, OpenAI API requests, or scheduled CV-generation runs are introduced by these UI features.

**Deployment:** After updating `webapp/Code.gs` and `webapp/Index.html` in the existing Google Apps Script project, create a **new version of the existing web-app deployment** (Deploy → Manage deployments → Edit → New version → Deploy). The GitHub commit alone does **not** automatically publish changes to the currently live Apps Script URL.


## Always-on discovery categories and master tracking (14 October 2026)

**Architecture:** The `Jobs` tab in Taaza is the one master list. Any other visible tab in the same spreadsheet with headers **A = Company Name, B = Designation, C = Link** is automatically recognised as a job category. Alert configuration tabs with other headers are excluded. Tab names are labels; Google sheet IDs are used by the web-app category filters so renames do not break an active category. `Jobs` must retain its name; a new category tab must use the same A–M job schema.

**Independently scheduled:** `.github/workflows/taaza-master-sync.yml` invokes `src/automate_cv/taaza_sync.py` at minute 13, 33 and 53 (UTC) of each hour, plus manual dispatch. It does not depend on the app being open or on `AUTOMATION_ENABLED` for CVs, and it never calls the OpenAI API. GitHub Actions schedule times can be delayed. The dashboard reads the existing master/category values without triggering its own regional sync. Compact Taaza/Freshmaal list snapshots are cached for 30 seconds to limit Google Sheets read requests; writes through the dashboard invalidate this cache immediately.

**Master `Jobs!P` — Job Categories:** Automatically updated for **all** current master jobs on every scheduled/dashboard sync. A job appearing in several specialist tabs is displayed with all labels separated by ` | ` (e.g. `TP Europe | Pooja Europe`). A job appearing only in master displays `Common`. The cell uses a dropdown whose options are rebuilt from the live tab names plus any shared-category combinations. The dropdown is for inspection; automatic source-tab membership is authoritative and will restore the computed value on the next sync. Avoid manually changing category cells to classify a role; instead add it to the appropriate specialist tab.

**Web-app Discovery:** Horizontal, scrollable category chips show `All jobs` (full master), `Common · Jobs only`, and all specialist job tabs. Selecting a specialist category filters the **master row** by vacancy URL membership. This preserves safe editing, candidate-specific flags and Freshmaal transfer actions. The filter is based on the tab's stable sheet ID; when you rename a category, the chip label updates automatically. Multiple category membership is allowed and does not duplicate master records. The existing separate Freshmaal Make CV filters remain unchanged.

**Safety:** Existing master rows, statuses, source tabs, not-interested flags N/O and column K transfer triggers are not overwritten. New master rows have K=FALSE, record their originating tab in M, and are deduplicated by canonical vacancy URL. A job that belongs to more than one specialist category has just one master vacancy. Other columns outside the additions and P are left untouched.

**Sheets 429 mitigation (15 October 2026):** Discovery uses the scheduled category membership in master `Jobs!P` instead of rescanning every specialist tab and every URL column for each search, filter or page. The tab-header list is cached for 4 minutes, list rows for 30 seconds, and the mobile search debounce is 650 ms. Refresh may therefore display direct Sheet edits up to 30 seconds later; dashboard writes invalidate the cached list immediately. The existing CV worker, prompts and transfer/status safety rules are unchanged. If a 429 still occurs, wait about a minute before retrying. **Publishing:** GitHub changes require updating the existing standalone Google Apps Script project's `Code.gs` and `Index.html`, then Deploy → Manage deployments → Edit → New version → Deploy. GitHub commits do not update the live `/exec` deployment automatically.


## Verified Connections and application tracking (16 October 2026)

- The existing Freshmaal \`Connections\` tab stores all jobs' contacts in exact A:L schema. The website's **Connections** action reads that sheet **on demand**, and filters using ALL of: full candidate name, exact Freshmaal row number, same company and canonical vacancy URL. A research result can never appear on a different applicant's or job's card solely because the company matches.
- Each Freshmaal job's detail drawer contains **Verified Connections** with source evidence, note copy, verified direct LinkedIn URL or clearly identified LinkedIn people search, and a refresh control. An already saved ChatGPT result becomes visible after pressing Refresh or reopening details; the separate HTML file is not necessary for the app view.
- Abhishek's human application status is stored in **Sheet1!BE**, Pooja's in **Sheet1!BF**. The ONLY selectable statuses are \`Unapplied\`, \`Applied\`, \`Applied + Connected\`, \`Rejected\`, and \`Accepted\`. The GitHub worker's legacy internal CV workflow state remains in its existing K/L columns, untouched. An empty manual status displays as Unapplied unless legacy status says Applied.
- New CV runs are blocked on statuses other than Unapplied, both in the web manual-run handler and in the scheduled/controlled worker's eligibility check. This does NOT clear the previous CV or alter the other candidate's state.
- When **Web** is checked on a new CV run, its completed GitHub workflow makes a best-effort, additional source-verification networking call, writes only new validated contacts to Connections and reads them back. Networking failures do not invalidate a completed CV. Web unchecked skips that extra call.
- With Web checked, **Copy Prompt** also adds exact candidate/row/vacancy-specific instructions for ChatGPT to research and save verified contacts to Connections. Without Web checked the prompt stays unchanged. If ChatGPT cannot access the sheet, it must supply an import-ready table instead of claiming saved.
- This repo stores the **source** for the Apps Script web application. Updating GitHub does NOT update the already-deployed Google Apps Script \`/exec\` URL. To publish this change, replace both \`Code.gs\` and \`Index.html\` inside the existing Apps Script project with the current files in this repository, then choose **Deploy → Manage deployments → Edit → New version → Deploy**. Keep the existing deployment URL and script properties; do not create a new app or change OAuth secrets.
- Before using paid networking on a live CV run, verify the updated Apps Script was deployed, that candidate-specific row filtering works on the already-saved BDO row 68, and that Google Actions/Sheets tokens permit writes to \`Connections\` without overwriting \`Sheet1\`.
