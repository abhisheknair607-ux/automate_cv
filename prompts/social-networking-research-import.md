# Networking Hub — Research Inbox to Freshmaal Connections

You are preparing a **manual, verified contact import** for the signed-in Garamaal candidate. This is not a CV run and must not call CV-generation APIs.

## Inputs
- Candidate: **[Abhishek Nair or Pooja Krishna Tirupati]**
- Research Inbox folder: **[paste the candidate's private Google Drive folder URL]**
- Target company/department/city: **[e.g. EY / Valuations / Dublin]**
- Existing Freshmaal sheet: https://docs.google.com/spreadsheets/d/1ltT1gPFcpBdz1Wp_CuxkwFpfkwnnhjL316yVu3gxPCc/edit

## Process
1. Read only filenames beginning `NEW_` and ending `.txt` in the specified candidate's connected Drive folder. Do **not** read or modify another candidate's folder, and do not process `USED_` files.
2. Each TXT is an unverified lead: it may contain a LinkedIn company/search URL and optional copied, user-supplied text. A URL alone does **not** establish which professionals work at the company. Do not claim access to gated LinkedIn pages, use unauthorised scraping, or invent people, job titles, direct profile URLs or hiring involvement.
3. Research names and current roles using accessible official company biographies and public professional sources. Keep the exact source URLs and confidence/cautions. For names with insufficient supporting evidence, record `Needs verification` in your response, but do not save them as confirmed contacts.
4. Classify each verified person as an **employee**, **senior professional/manager**, **in-house talent recruiter**, or **external/agency recruiter**. Draft a distinct, natural LinkedIn invitation according to that role (maximum 300 characters) based only on established candidate history and verified recipient facts. Do not imply personal relationships or job openings that have not been confirmed.
5. Read the existing Freshmaal `Connections` tab. Preserve its **exact A:L header order**:
   Company | Contact Name | Direct LinkedIn Profile | LinkedIn Search | Applied-for Role | Candidate | Freshmaal Row | Vacancy Link | Person's Position | Verification / Evidence | Outreach Message | Research Date (UTC)
6. De-duplicate against this candidate's existing records, conservatively using name + company and verified direct LinkedIn profile, and preserve all job-linked records. For a non-job networking contact set `Applied-for Role` to `Networking`; leave `Freshmaal Row` and `Vacancy Link` blank. Set Candidate to its full correct name, and store direct LinkedIn profile URL **only if verified**, otherwise leave it blank and provide a LinkedIn people-search URL. Add actual date in UTC.
7. If the connected Google Sheets app has write permission, append only the new verified rows in A:L. Do not overwrite `Sheet1`, CV prompts, model settings, scores, statuses, or existing connections. Re-read the exact appended rows and confirm that all expected values are saved.
8. **Only after successful verified writes**, rename the corresponding Drive source `NEW_...txt` to `USED_...txt`. Keep its remaining filename unchanged. If any write, source verification, or rename fails, report the exact failure and leave the file in `NEW_` status whenever possible. Never claim a write succeeded without verifying it.
9. Report: processed TXT filenames, valid new contacts, duplicates skipped, unresolved identities, spreadsheet row links, renamed files, and any failures. If you cannot use Google Drive or Sheets connectors, produce an import-ready table and leave all source files untouched.

This operation is explicitly user-initiated. No LinkedIn invitations or follow-ups should be sent.
