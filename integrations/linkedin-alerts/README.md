# Garamaal — Multi-provider job alert importer (Python)

**Staged only.** The importer is committed on branch feature/linkedin-alerts-taaza-20261026. No parser has been approved for live import, Gmail is not authorized for the shared mailbox, **no spreadsheet rows have been written**, and no scheduled job is enabled or deployed.

## Code

- [Python Gmail-to-Taaza importer](../../src/automate_cv/linkedin_alert_import.py)
- [Per-provider parsing and location rules](../../src/automate_cv/job_alert_providers.py)
- [Parser tests from 25 October samples](../../tests/test_job_alert_providers.py)
- [End-to-end synthetic importer tests](../../tests/test_linkedin_alert_import.py)
- [Manual GitHub Actions preview](../../.github/workflows/linkedin-alerts-to-taaza.yml)

## Sources and verification

| Source | Current status | What the importer does |
| --- | --- | --- |
| LinkedIn | Implemented and tested on synthetic fixtures | Exact sender; job-view links; validates role/company/location; ignores alert-created notifications |
| Indeed | Implemented against observed 25 October 2026 email format | Exact confirmed sender donotreply@jobalert.indeed.com; extracts title, company, location, explicit salary, canonical viewjob link; strips email tracking |
| IrishJobs | Discovery/manual review only | Registered domain; unknown HTML/email template is flagged Review, not inserted |
| Jobs.ie | Discovery/manual review only | Registered domain; unknown HTML/email template is flagged Review, not inserted |
| Other alert sites | Not enabled | Add one exact sender + verified parser + test fixtures before permitting any import |

**Why IrishJobs and Jobs.ie do not automatically import yet:** No genuine email from either service was present in the inspected Abhishek mailbox on 25 October 2026. Guessing their templates would risk writing incorrect jobs. Provide real mail samples for a future non-writing QA review, then enable each provider separately.

### Strict extraction rules

1. Only actual alert digests, never newsletters, alert-created confirmations, navigation links, logos or notifications.
2. Each vacancy must have a real company, title, explicit location and a canonical verified job URL. Deduplicate by source and stable job identifier across every Taaza job tab.
3. **Ireland and UK only** by default. Mumbai/India and other explicit overseas locations are rejected; unknown geographies are excluded for review.
4. Indeed sponsored **pagead** links without a real stable job key are excluded because a safe canonical link cannot be verified from the 25 October emails. Such excluded links never become vacancy rows.
5. Salary is recorded only when explicitly present. Job Description, Posted Date, deadline, start date and visa fields are empty unless verified, never invented. Date Added is the date of actual import; Send to CV Sheet is always FALSE.
6. Candidate ownership comes from original email address or safely identifiable forwarding headers. Unassigned/ambiguous emails remain in Review, not in job intake.
7. Email Import Log stores message ID and review decision; it is not part of the main Jobs tab. LinkedIn Job ID column remains blank for Indeed.
8. Gmail API permission is read-only; the existing Garamaal Taaza sync handles the master mirror. No edits to master Jobs, Fresh Maal, Make CV, Cloud Run, Firebase or webapp interface.

## What the 25 October 2026 samples show

Two Indeed messages were read from Abhishek's connected mailbox on **25 October**:
- 00:07 UTC — 16 advertised jobs in Dublin/Meath.
- 21:01 UTC — 14 advertised jobs in Dublin.

Of 30 advertised slots, the observed format shows 20 direct Indeed links with stable job IDs (11 distinct after deduplication) and 10 sponsored pagead links lacking stable job IDs (five listings repeated). The importer conservatively selects verified direct links only. **No real Gmail API import has been executed.** The automated tests reproduce safely minimal job-card lines from these messages, not private raw MIME or tracking URLs.

## Gmail and Google authorization — required before any use

1. Both personal Gmail accounts should forward only job-alert messages to the common mailbox at abhisheknair607@gmail.com. For additional providers, create provider-specific sender filters separately. Do not enable all-mail forwarding.
2. Enable Gmail API in your Google Cloud project. Authorize the **common mailbox user**, not the GitHub service account, to read Gmail using the Gmail readonly scope. OAuth refresh tokens belong in GitHub Actions secrets and must never be committed or pasted in chat.
3. Add three NEW repository Actions secrets:
   - LINKEDIN_GMAIL_CLIENT_ID
   - LINKEDIN_GMAIL_CLIENT_SECRET
   - LINKEDIN_GMAIL_REFRESH_TOKEN

   These names are retained from the original LinkedIn prototype but now authorize the same shared inbox for all whitelisted sources. Never overwrite the existing CV automation's GOOGLE_OAUTH_* secrets. Sheets access uses the existing Taaza Workload Identity/service account configuration, or its existing OAuth fallback.
4. Run a dry preview on exactly 25 October first; this uses **Europe/Dublin** midnight boundaries across the DST change:

       python -m src.automate_cv.linkedin_alert_import --on-date 2026-10-25

   The preview reads the sheet headers and previous IDs but does not append any rows or alter Gmail. Review all examples, candidates, excluded ads, and error reasons.
5. The GitHub Action has **manual dispatch only**, defaults to the 25 October date, and defaults to **apply=false**. After parser approval and Gmail authorization, you may choose a deliberate first live write with:

       python -m src.automate_cv.linkedin_alert_import --on-date 2026-10-25 --apply

   Do not run the apply command or tick the apply checkbox until the user explicitly approves the parser. There is **no schedule**; adding recurring runs is a separate decision.

## QA

Run from repo root:

    PYTHONPATH=src pytest -q tests/test_job_alert_providers.py tests/test_linkedin_alert_import.py

The existing GitHub tests workflow runs automatically on the feature branch. Preview and synthetics do NOT substitute for a live read-only Gmail preview on the common account.

The pre-existing standalone Code.gs in this directory is a **superseded and unactivated prototype**. Do not install or activate its Apps Script trigger.
