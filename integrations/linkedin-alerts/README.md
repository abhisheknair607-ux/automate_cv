# LinkedIn job alerts -> Taaza -> Garamaal (staged)

**Status (2026-10-26):** Code and live Taaza intake/log tabs created. **No Gmail importer trigger installed, no email imported, and no production web app or CV workflow code changed.** The source is intentionally isolated from \`webapp/Code.gs\`, Cloud Run, Fresh Maal, and the hourly CV worker.

## Existing flow preserved

- Previous working reference: Pooja's **Mass Apply** workbook, with \`Jobs\`, \`Import Log\`, \`Config\`, and \`Digest Log\`. The former trigger was removed; this integration does not reactivate or modify the Mass Apply workbook.
- Existing Taaza \`Jobs\` regional master sync runs independently at minute 13/33/53 and picks up new source tabs by exact first three headers \`Company Name\`, \`Designation\`, \`Link\`.
- Existing Garamaal Discovery reads Taaza \`Jobs\`. Its established manual Save JD -> Fresh Maal transfer is unchanged; nothing in this importer selects \`Send to CV Sheet\` or Make CV.
- **Common Gmail mailbox:** \`abhisheknair607@gmail.com\`. Forward ONLY job-alert emails from \`itsabhisheknnair@gmail.com\` (Abhishek) and \`poojaktirupati@gmail.com\` (Pooja). Do not enable all-mail forwarding, and do not forward personal messages or notification emails unrelated to vacancies.
- The 2 new live Taaza tabs are \`Email Alerts\` (A:P) and \`Email Import Log\` (A:K). They are additive and do not change the main Jobs columns.

## Setup — one-time Gmail authorisation required

1. In both personal Gmail accounts, verify that only mail from **jobalerts-noreply@linkedin.com** is forwarded to the common inbox, using Gmail's **Forward it to** filter for that sender. Turn off account-wide forwarding. The common mailbox must receive the original sender and ideally the original \`To:\` header; \`To:\` is used to distinguish Pooja from Abhishek, otherwise owner becomes \`Unassigned\`.
2. Log into **the common mailbox** (\`abhisheknair607@gmail.com\`) and confirm it has **Editor** access to [Taaza Videsi Maal](https://docs.google.com/spreadsheets/d/1jt3WXqpnzVOYcKCpABIp-7UMUPr48kVhMkLfzGEHHZY/edit). The importer's credentials must be authorised for Gmail and Google Sheets; they are **not** your GitHub CV worker OAuth credentials.
3. From the common mailbox, open [script.google.com](https://script.google.com), create a **standalone** Apps Script project called \`Garamaal LinkedIn Alerts\`, and paste all of [Code.gs](Code.gs). Do not paste it into the existing Garamaal dashboard's \`Code.gs\`; that would mix unrelated permissions.
4. Set project timezone to \`Europe/Dublin\`. Run \`previewLinkedInJobAlerts\` first (the two tabs have already been added to Taaza). Review **Executions > Logs** and the counts. This method does not write rows or change Gmail labels.
5. After verifying at least one real LinkedIn digest with correct company, title, and location, run \`installLinkedInAlertImporter\`. Complete the Google consent flow using the **common mailbox** account. It installs only the \`importLinkedInJobAlerts\` 15-minute time trigger and creates \`Job Discovery/Imported\` / \`Job Discovery/Review\` labels if missing.
6. Run \`importLinkedInJobAlerts\` once manually, then verify \`Email Alerts!A:P\` and \`Email Import Log!A:K\`. Each Gmail **message ID** is logged to prevent reprocessing. LinkedIn job IDs are deduplicated against existing Taaza job tabs.
7. Verify the independent regional sync (GitHub Actions \`taaza-regional-master-sync\`), and check the imported job in Taaza \`Jobs\` and Garamaal **Discovery**. Full job descriptions remain **missing** until manually saved; new rows never trigger CV generation.

## QA and safety contract

- Only parse job links with \`linkedin.com/(comm/)?jobs/view/<job-id>\`. Ignore alerts-creation confirmations, company-logo-only links, links to generic LinkedIn searches, and unrelated senders.
- Keep exactly one canonical URL \`https://www.linkedin.com/jobs/view/<id>/\` per distinct job ID. Do not append tracking tokens from email into the Sheet.
- A: M matches existing Taaza source-tab schema; N:P stores candidate provenance, Gmail message ID, job ID. These provenance columns are **not** carried to the master by the existing sync.
- \`Email Import Log\` stores one row per processed Gmail message. Partial malformed emails are tagged for review rather than inventing a role or company.
- Importer does not enrich a full JD, scrape a protected LinkedIn page, rank roles, invoke the OpenAI API, mark any vacancy as Applied, or generate CVs.
- Setup requires manually authorised Apps Script because the connected ChatGPT Gmail account is different from the common inbox. The file committed to GitHub is a **deployment source**, not an activated Apps Script project.
- Disable/revert by removing only \`importLinkedInJobAlerts\` from **Apps Script > Triggers**. No existing Garamaal app change is involved.

## Testing

Run \`node --test integrations/linkedin-alerts/parse.test.cjs\` from the repository root. The tests cover job-anchor selection, normalization, malformed anchors, sender checks, and candidate attribution.

## Initial rollout note

Some LinkedIn digest formats vary. A real incoming email with an uncommon HTML layout may end up in \`Job Discovery/Review\` with no job row, rather than being misparsed. Review these manually before widening parsing rules. Live end-to-end Gmail and Apps Script execution cannot be completed without authorising the common Gmail account.
