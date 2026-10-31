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
