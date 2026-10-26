# LinkedIn job alerts -> Taaza -> Garamaal (Python integration)

**Status:** The Python implementation is committed to the feature branch. It is NOT activated, not merged or deployed, and has not imported live mail.

- [Python importer](../../src/automate_cv/linkedin_alert_import.py)
- [Python unit tests](../../tests/test_linkedin_alert_import.py)
- [Manual GitHub Actions workflow](../../.github/workflows/linkedin-alerts-to-taaza.yml)

The original Code.gs and JavaScript parser tests in this directory are a superseded, unactivated prototype. **Do not install the Apps Script trigger.**

## Data flow

LinkedIn job-alert digests -> Abhishek and Pooja Gmail **sender-filtered** forwarding -> shared inbox at abhisheknair607@gmail.com -> Python Gmail API (read-only) -> [Taaza Videsi Maal](https://docs.google.com/spreadsheets/d/1jt3WXqpnzVOYcKCpABIp-7UMUPr48kVhMkLfzGEHHZY/edit), tabs **Email Alerts** and **Email Import Log** -> existing independent Taaza sync -> Garamaal Discovery.

Existing destination tabs already exist. No importer code writes to master Jobs, Fresh Maal or the Garamaal website, fetches job descriptions, applies to jobs, generates CVs, or spends OpenAI API tokens. New intake rows have Send to CV Sheet = FALSE.

## One-time Gmail OAuth authorization

1. Keep **general forwarding disabled** on Abhishek and Pooja mailboxes. Each personal mailbox must have a Gmail filter forwarding *only* jobalerts-noreply@linkedin.com to the shared inbox. Verify an actual new job digest reaches the shared inbox; confirmations that a job alert was *created* do not count.
2. Enable the **Gmail API** in a Google Cloud project you control. Configure an OAuth client for the **personal shared Gmail account**. Gmail authorization requires that account's refresh token; an existing GitHub Workload Identity service account cannot read an ordinary personal @gmail.com inbox.
3. To obtain a shared-inbox refresh token you can use [Google OAuth 2.0 Playground](https://developers.google.com/oauthplayground/). Select *Use your own OAuth credentials* in the Playground settings, create a matching OAuth web client with redirect URI https://developers.google.com/oauthplayground, sign in as **abhisheknair607@gmail.com**, authorize **https://www.googleapis.com/auth/gmail.readonly** only, and exchange the code for a refresh token. Gmail readonly is a restricted scope; observe Google's consent and verification rules. External apps in *Testing* can issue refresh tokens that expire after seven days, so plan for a valid ongoing configuration before enabling automation.
4. Add these as **new GitHub Actions Secrets** in repository Settings -> Secrets and variables -> Actions:
   - LINKEDIN_GMAIL_CLIENT_ID
   - LINKEDIN_GMAIL_CLIENT_SECRET
   - LINKEDIN_GMAIL_REFRESH_TOKEN

   **Never** commit a token or share credentials in a message. Do **not** overwrite the CV worker's GOOGLE_OAUTH_* secrets. For Sheets writing, the importer reuses the existing Taaza-sync Workload Identity flow and its optional Sheets OAuth fallback. That credential must have Editor access to Taaza.

## Running

Before writing, run a **preview** and verify candidate ownership, especially on forwarded emails. From the repo root with the Google Python dependencies installed and credentials available:

    python -m src.automate_cv.linkedin_alert_import

Apply only after validating the preview and original candidate:

    python -m src.automate_cv.linkedin_alert_import --apply

Retry messages in Review after fixing classification:

    python -m src.automate_cv.linkedin_alert_import --apply --retry-review

Alternatively, **after the feature branch is reviewed and merged into main**, navigate to Actions -> linkedin-alerts-to-taaza -> Run workflow. The default is a read-only preview; tick **apply** to write. The GitHub workflow is **manual-only**: it does not automatically schedule jobs until a separate decision to enable one.

After applying, inspect **Email Alerts!A:P** and **Email Import Log!A:K**. The existing regional sync mirrors new jobs to master Jobs independently (minute 13,33,53). The full JD remains unavailable until the normal JD save process.

Run non-network tests:

    PYTHONPATH=src pytest -q tests/test_linkedin_alert_import.py

## Safety and limitations

- Verify RFC822 sender exactly, and accept only proper LinkedIn /jobs/view/<numeric-id> URLs. Deduplicate against all source tabs in the Taaza workbook, including the master.
- Candidate owner must be identified from original To, forwarding headers, or forwarded-message To; otherwise the message is logged for **Review** and **not imported**. Gmail forwarding often changes headers, so test a real forwarded Pooja and Abhishek digest before applying.
- Messages with uncertain job links or no valid job cards are reviewed, not turned into fake rows. Created-alert confirmations are skipped even when they contain embedded example jobs.
- The importer logs Gmail message IDs to prevent repeat processing; reviewed messages require explicit retry. Gmail access is **read-only**: no mail deletion, forwarding, labelling, or changes to the sender filters.
- Taaza's master Jobs deduplicates by LinkedIn job URL, **not** by candidate. Although Email Alerts preserves Alert Owner, master Jobs does not currently carry this provenance. Do not assume the shared master has candidate-specific isolation.
- A verified end-to-end Gmail read/write test remains necessary after the common inbox is authorized; synthetic tests alone do not prove every LinkedIn HTML template will parse.
