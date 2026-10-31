# Garamaal Profile Engine — first implementation slice (31 October 2026)

## Objective
Expose existing candidate evidence from Drive as structured, reviewable sections, support STAR achievements, number verification, custom sections and saved edits in the Copper & Porcelain Profile. Preserve Drive as the CV source until a separately validated migration.

## Drive source audit (read-only)
These are verified populated Drive documents, **not confirmation that GitHub Actions currently uses these exact IDs**. Inspect the active worker variables before configuring Cloud Run.

| Candidate | Purpose | Observed original | Notes |
|---|---|---|---|
| Abhishek | Master facts | MASTER EVIDENCE BANK.docx | Detailed experience, projects; modified 27 Sep 2026 |
| Abhishek | Router | SUMMARY DOC.docx, beginning MASTER EVIDENCE ROUTER & RETRIEVAL INDEX | Compact router distinct from master; modified 27 Sep 2026 |
| Pooja | Master facts | POOJA_MASTER_EVIDENCE_BANK_FILE_ID - Master Evidence Bank.docx, containing CANDIDATE KEY pooja | Populated original under Pooja Sources; modified 14 Oct 2026 |
| Pooja | Summary | POOJA_SUMMARY_DOC_FILE_ID - Summary Doc.docx | Populated source under Pooja Sources; modified 14 Oct 2026 |

A similarly titled older Pooja master file is a placeholder and must NOT be imported. The importer rejects placeholders, missing sources, wrong-candidate markers, and mismatched evidence markers. A historical Abhishek SUMMARY DOC is a longer detailed copy; do not confuse it with the compact router. Original Drive documents remain unchanged.

## Implementation
- profile_evidence.js: candidate checks, explicit evidence keys, original text preservation, automatic reviewable section classification, observed numbers marked unverified, blank STAR fields.
- profile_service.js: protected API endpoints behind GARAMAAL_PROFILE_ENABLED, service-account Drive read, DOCX extraction, secure Firestore storage and revision conflicts. First import only, no overwrite of edited profiles.
- profile_engine_client.js and profile_engine.css: Profile navigation, evidence search, original source view, STAR editing, CV bullet drafts, number review, custom sections and candidate-added records.
- Original Profile editor remains enabled by default. No CV, CL, ranking, Jobs, Social or Drive writes change in this branch.
- Explicit user source preview and confirmation; no OpenAI API usage.

## Activation prerequisites
1. Verify active Drive IDs in the existing GitHub Actions variables and configure Cloud Run: MASTER_EVIDENCE_BANK_FILE_ID, SUMMARY_DOC_FILE_ID, POOJA_MASTER_EVIDENCE_BANK_FILE_ID and POOJA_SUMMARY_DOC_FILE_ID. Never store source IDs in public JavaScript.
2. Ensure the Cloud Run service account has read access to those four specific Drive files. GitHub Actions OAuth access does not imply Cloud Run access. Do not widen sharing publicly.
3. Confirm Firestore is enabled in the same project and grant the Cloud Run service account only its required Datastore permissions. Server-side documents are stored under a hashed email identity and a distinct candidate document. Confirm tenancy before expanding to multi-user.
4. Keep GARAMAAL_PROFILE_ENABLED unset in production. Deploy to a canary revision at 0% traffic, enable the feature flag on that revision only, and test import-preview, first import, revisions, add/edit, candidate isolation and fallback. Preserve all unrelated environment variables and traffic.
5. Run npm install, npm test, and node --check for new modules. Test original CV and CL generation remains unchanged before any promotion.

## Remaining stages
- Import fidelity: classification review for mixed sections, extract tables safely, deduplicate without loss, and add a non-destructive diff refresh.
- UI refinement: replace browser prompts with inline editors, reorder/delete custom sections, and add original source links.
- STAR support: AI-assisted suggestions with exact source evidence; human-verified outcomes and numbers only.
- Multi-user ownership: validate auth boundary and roles before launch.
- Worker integration: a separately gated Python evidence adapter that reads a versioned Firestore profile rather than Drive. JD requirements must be assessed independently, followed by a selected and verified evidence handoff; never fabricate keywords or employment outcomes.
- End-to-end regression: compare source-backed CV output, formatting, proof and candidate isolation, and retain a rollback to Drive.

No production deployment or CV source-switch is part of this implementation slice.


## Stage 2 — smart classification and import audit (31 October 2026)

The source audit also checked the *content shape*, not just filenames:

- Abhishek master: approximately 112,000 extracted characters / 1,600 lines, with workstreams, finance projects, and explicit project inventory. The router is approximately 25,000 characters / 365 lines.
- Pooja master: approximately 66,000 characters / 535 lines, containing 36 explicit EVIDENCE blocks. The summary/role bank is approximately 87,000 characters / 795 lines.
- One Pooja CORE-CREDENTIALS block mixes education, certifications, awards, volunteering and interests. The Stage 2 parser splits these into separately classified review records while retaining the parent evidence key.
- Abhishek's numbered professional workstream headings are now recognised; numbered result statements are kept as original body text, not misread as headings.
- The router is always a **reference** section and is never eligible to be marked verified CV evidence. Only original candidate-owned Master Evidence Bank records can be reviewed for future CV use.
- Every nonempty extracted text line must be accounted for by the records (with EVIDENCE/END EVIDENCE markers counted separately). Fail closed if the number differs. This verifies the extracted text, not the preservation of DOCX rich formatting, images or embedded media.
- Exact duplicate *content* is flagged while keeping both source records. Uncertain headings carry a classification confidence/reason and require manual review. No achievement or number is automatically verified.
- A new authenticated /api/profile/readiness check tests actual Cloud Run identity access to the configured Drive files and Firestore without writing data or returning the file IDs.
- Import/save are now independently gated by APP_READ_ONLY=false and GARAMAAL_PROFILE_WRITES_APPROVED=true, on top of GARAMAAL_PROFILE_ENABLED=true and the existing Firebase account allowlist. Never turn on the profile write gate as part of a generic UI-only production release.

### Safe staging validation

The existing deploy-garamaal-production.sh is a **production release script**, NOT a profile staging launcher; do not use its --release mode to test these changes. Its environment preservation checks are deliberate.

Use an isolated staging service or separate **zero-traffic** revision with the correct Google Cloud runtime identity, candidate-specific source IDs, and access controls. Because enabling the profile feature and write gate requires explicit environment changes, verify that only the intended staging revision gets those flags and that the existing production traffic split and secrets remain untouched. Test the following before enabling any live profile writes:

1. Google sign-in by an allowed email succeeds; anonymous users get 401, disallowed emails get 403.
2. Profile readiness reports the two correct source files and Firestore connectivity for **each** candidate.
3. Both profile read calls show separate candidate-owned empty profiles before first import.
4. Import preview reports records, source coverage and classifications; a placeholder or wrong-candidate document is rejected.
5. First import is confirmed; repeat import returns a conflict without altering previously saved data.
6. User-approved STAR edits, custom sections and additional records survive reloads, browser changes and revision checks.
7. Browser stale-revision writes fail instead of silently overwriting recent edits. Router records cannot be verified CV material.
8. Save controls fail closed when the profile write gate is disabled; original CV and CL remain sourced from Drive.
9. Validate source-text completeness and human-review sample records against both original Drive documents.
10. Confirm no live Cloud Run traffic or Jobs/Social behaviour changed.

**Deployment limitation:** GitHub connector access is available for code and automated CI, but this chat has no direct Cloud Run configuration, Firestore IAM or active GitHub Actions variable-management capability. The staging permission checks above are not yet executed; never claim the Profile engine is live until they pass.

### Next planned stage

Stage 3: in-page edit/add-section dialogs, section ordering and optional archiving, provenance links, better search and confidence review. Stage 4: sourced STAR assistance and metric evidence checking. Stage 5: final candidate ownership / Firestore security and versioning. Stage 6: after review and controlled tests, migrate the Python CV worker to a verified, versioned profile evidence package with a rollback to Drive.
