# Pooja evidence source update

The Pooja Summary Doc now preserves all prior paragraphs and tables and appends the applicant-supplied comprehensive master CV, current-fact precedence rules and an automation evidence index. The detailed Master Evidence Bank replaces the previous placeholder with 36 bounded records. Personal CV text stays in Drive; it is not committed to this public repository.

## Existing Drive configuration

The existing IDs are retained, so these two repository variables need no new value if already configured correctly:

| Variable | Drive file ID |
| --- | --- |
| POOJA_SUMMARY_DOC_FILE_ID | 1lT_OP5Il-R8ifvvYqfO0NEARJYzo76SS |
| POOJA_MASTER_EVIDENCE_BANK_FILE_ID | 1nCV4a4nBYWbBoh3AoIlH3nwFqgd_5JSb |

Pooja source folder: 1mlxbfKT672OJQH8Diehv0QVS6caUr5wA.

A backup of each replaced file is retained in the dated backup folder beneath Pooja Sources. The original Summary Doc is preserved in full, so Stage 2 still receives the entire document; this change does not claim token reduction for that stage.

## Evidence selection

Pooja's bank declares `CANDIDATE KEY pooja`. Each record has unique exact lines `EVIDENCE <key>` and `END EVIDENCE <key>`. Professional keys use `PR-POOJA-*`; project and other evidence keys use `FIN-POOJA-*`, including `FIN-POOJA-P01` through `FIN-POOJA-P19` and `FIN-POOJA-MORGANS`.

Stage 2 receives the exact-key instruction through the candidate-specific context contract, leaving the substantive Drive prompts unchanged. Stage 3 retrieves only selected or verification-requested records, plus current chronology, credentials and guardrails. Missing records, duplicate anchors, cross-candidate IDs and mismatched banks fail closed. Abhishek retains his existing selectors.

The latest master controls current facts, while existing project contribution restrictions remain in effect. Historical evidence is explicitly identified, and unsupported employer attribution still requires verification. A roadmap, prospecting pipeline or coursework output must not become a completed launch, acquired client count or professional client engagement.

## Validation and activation

- Local full test suite: 117 tests passed, including five Pooja source checks.
- Updated source documents were rendered and inspected; the original Summary body elements were checked for exact XML preservation.
- Every indexed Pooja key was checked against the actual detailed bank using the deterministic selector.
- No paid OpenAI generation or scheduled production run was initiated by this update.

Merge the source-selector changes before using the new Pooja bank in production. Then run connectivity-test and one controlled-cv-test on the branch or merged commit, choosing candidate `pooja` and a reviewed Freshmal row. Verify the final one-page CV and optional cover letter, current facts, Factual_QA.md, selected evidence and cost telemetry before enabling unattended processing. Repository variables and secrets were not modified or independently inspected in this update.

## Final source audit

Pooja's two reference CVs, cover-letter template and CV/cover-letter rules were still setup placeholders. They are now populated in place, and the older base CV was corrected for portfolio size, MSc completion and qualification status. Prior versions are backed up under Pooja Sources. The references render to one page, retain the candidate's actual employment chronology and use the existing CV layout. Cover-letter template fields are intentional job-specific inputs; final letters must contain no unfilled fields.

The latest scheduled run (`37229206387`) shows every required Pooja source ID configured to the IDs above and the existing Pooja folder. Optional project folders remain unset; indexed project evidence is in the detailed bank. The run fails before reading sheet rows because the configured Google OAuth refresh token is expired or revoked (`invalid_grant`). This is a shared runtime authentication blocker, not a candidate-source issue. Restore the Google authorization through the repository's documented OAuth setup, then run connectivity and a single controlled Pooja generation before treating the checkbox workflow as operational. No secrets were changed by this source update.

Fresh Maal was audited through row 1000: no Pooja CV or cover-letter requests were selected. Abhishek's sources, requests and saved outputs were left untouched. Local deterministic checks passed; a live Pooja CV generation remains unverified while authentication is blocked.
