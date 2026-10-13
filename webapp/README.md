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

**No changes have been made to either Google Sheet, the Taaza discovery scraper or the existing GitHub CV worker as part of this webapp build.** The web app writes to the sheets only after it has been deployed and a user takes an explicit action.

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

To avoid changing the existing architecture prematurely, **the build has not been pushed into the current `automate_cv` repository or deployed into your Google account**. The source can be stored as a new separate GitHub project later, after you approve deployment.


## 13 October 2026 additions
- Compact full-width responsive dashboard and multi-column desktop job cards.
- Labels: **Seems Kacha** (JD incomplete), **Seems Taaza** (JD saved and valid), **Seems Fresh** (transfer control), **Garam CV Ready** (existing CV link available).
- Freshmaal model tiers use AR (Abhishek) and AS (Pooja), with Economy, Balanced, Premium. No existing original columns moved.
- Each tier selection writes only one corresponding candidate/job cell; avoid changes during active CV generation.
- Model IDs are resolved by GitHub's src/automate_cv/model_presets.py, not editable directly in Sheets.
- Existing blank model tier resolves to Premium.
