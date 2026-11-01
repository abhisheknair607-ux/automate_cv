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


## Stage 3 — full responsive editor (31 October 2026)

Feature branch: feature/activate-garamaal-profile-20261031; draft pull request #99.

### Implemented UI and data safeguards

- New isolated profile_engine_v3.js served from the existing /prototype/profile-engine.js endpoint only when GARAMAAL_PROFILE_ENABLED=true. The earlier browser-local Profile remains available as rollback when the flag is off.
- Responsive Copper & Porcelain profile workspace with accessible mobile section selector, keyboard navigation, light/dark styling, and section-specific evidence lists.
- Inline forms for adding factual evidence and adding or renaming custom sections. No browser prompt() or direct Firebase clients in the new editor.
- Move sections up/down, archive empty custom sections, restore archived sections (on mobile and desktop). Built-in sections and records cannot be deleted; nonempty custom sections cannot be archived.
- Global search across all original evidence, titles, keywords, draft CV bullets, provenance and section names; review/verified/duplicate/reference filters. Paged display for large evidence inventories.
- Display original Drive evidence unmodified with file source links, evidence key/locator and extracted line range. Optional editable working facts are stored separately from the original source, with their own number observations and status reset.
- Editable STAR fields, keywords, CV-draft bullet, classification review and numeric review checkboxes. Human review is required before verification. Router records are not CV-eligible.
- Unsaved-edit warnings when changing sections or closing the editor. Save is explicit and revisions protect against concurrent overwrites.
- Pure tested backend mutation functions for safe section and evidence operations, used inside the authenticated Firestore transaction. Candidate separation and CV worker isolation remain unchanged.
- Existing Jobs, Make CV, Social and original Drive file sources are unchanged; no profile-to-CV switch or model tokens are used by these UI edits.

### Staging prerequisite audit

A new **read-only** script is available:

    bash standalone/profile-staging-readiness.sh

It defaults to service automate-cv-staging in project abhishek-cv-automation and region europe-west1. It inspects the selected Cloud Run service and Firestore configuration without changing anything. The script refuses the production dashboard by default.

For a differently named staging service:

    GARAMAAL_STAGING_SERVICE=your-isolated-service bash standalone/profile-staging-readiness.sh

For audit-only inspection of production (still no mutations), the user must deliberately opt in using ALLOW_PROFILE_PRODUCTION_INSPECTION=true and GARAMAAL_STAGING_SERVICE=automate-cv-dashboard. **Do not enable any profile flags on production during Stage 3.**

It deliberately does not print Drive file IDs, OAuth tokens or secret values. Environment variable presence is not sufficient: staging must also pass the authenticated /api/profile/readiness check, and then a controlled import preview, actual import, STAR/section edits and mobile/browser testing before any production approval.

Cloud Run runtime configuration, Firestore IAM and a live staging URL cannot be tested or changed through the available GitHub connector. The CLI script must be executed in an appropriately authorised Google Cloud Shell session. Do not claim runtime readiness or end-to-end browser testing merely because repository CI passes.

### Deferred until later stages

- Automatic STAR bullet drafting and metric validation against underlying source evidence (Stage 4).
- Production-grade candidate tenancy and Firestore policy review, live staging import/save and source refresh diff (Stage 5).
- CV worker profile evidence adapter with strict verified-only selection, source-version pinning and Drive rollback (Stage 6).
- Full end-to-end browser/paid-CV regression and explicit guarded activation (Stage 7).


## Stage 4 — grounded STAR and JD intelligence (31 October 2026)

This stage is developed on draft PR #99 (no production deployment). It adds conservative, transparent, extractive assistance, not free-form generative AI.

### Implemented

- STAR: profile_suggestions.js reads each eligible candidate-owned original evidence record and returns verbatim Situation, Task, Action and Result excerpts. Each includes exact character offsets, source hash, and evidence locator. Unsupported STAR fields stay blank; no results are invented.
- Numerical evidence: original percentages, money and quantified scope are presented with surrounding source excerpts. A read-only claim-check endpoint compares numbers in unsaved STAR, working facts and CV drafts against the immutable original record.
- Approval gate: an unsupported numerical claim cannot be marked verified. Adding an unsupported number to a verified record downgrades its status and resets number approval. Equal amounts with different meanings still require manual context checks.
- JD screen: a pasted job description is compared with a bounded vocabulary of terms and aliases in original candidate-owned evidence. Exact matches have source excerpts and review status; absent terms are flagged as gaps. Guardrails and routing references are not evidence. This is not a semantic fit score.
- UI: source excerpt checkbox selections can be inserted into unsaved STAR and CV draft fields only by explicit action, with verified status and numeric approval reset. JD keyword tags are inserted into a record draft only when the user opens the matching source; Save evidence remains a separate review step.
- New endpoints: /api/profile/suggest, /api/profile/check-claims, /api/profile/jd-match. They are read-only, authenticated, profile-flag-gated and revision-scoped. JD text is analysed in the request but not stored in Firestore or Drive or sent to an external model.
- Original CV worker, Jobs, Social, Drive sources, deployment flags and production traffic remain unchanged. No model API tokens used.

### Tests and limitations

- Added unit tests for literal source offsets, numeric precision, missing STAR fields, unsupported currency/percent claims, candidate evidence isolation, negative-claim and routing restrictions, and JD keyword support/gaps.
- Added separate integration safety checks for authenticated read-only routing, explicit draft review, and no CV worker integration.
- Phrase matching is deliberately narrow and may miss real skills. Matching keywords and numbers do not establish actual work ownership or accuracy: all approvals must be manually reviewed.
- GitHub CI cannot validate live Firestore IAM, actual Cloud Run Drive permissions, and browser/device rendering. Run the existing read-only staging audit and authenticated profile connection checks before enabling any write gate.

### Stage 5 next

Validate production-grade identity/permission separation, Firestore record version history, a non-destructive Drive source refresh and reviewed merge, and real staging import/edit tests. Stage 6 will separately connect verified Profile evidence to the CV worker with a rollback to Drive, only after the Stage 5 evidence and security gates are approved.


## Stage 4 — source-backed STAR, metrics and JD keyword review (31 October 2026)

### Candidate-owned, explainable suggestions

- The Profile editor includes a **Suggest STAR from original** action for each eligible evidence record. It proposes verbatim, source-offset excerpts for Situation, Task, Action and Result. Missing fields remain blank; no fabricated result, employer, amount or seniority is inserted.
- The reviewer selects the excerpts to insert into the unsaved STAR and CV-draft fields. The suggestion itself makes no Firestore write and never marks the record verified.
- The source document, candidate, evidence key and original excerpt offsets stay attached to the suggestion. Routing reference records are ineligible for automatic STAR claims.
- This stage uses a deterministic phrase extraction and keyword dictionary, not a generative model. The result is a suggested structure to review and rewrite, **not** an automatically polished or approved CV achievement.

### Numeric claims: source validation plus outcome-context comparison

- All recognisable percentages, currencies, counts, quantified units and standalone numbers are checked against the original evidence text. Numbers in an edited working fact alone are **not** source evidence.
- Read-only /api/profile/check-claims returns each number, source-sentence excerpts, match status and warnings for absent numbers or numbers appearing under different outcome contexts.
- Example: if the source says "improved client satisfaction by 40%", the draft "grew revenue by 40%" is flagged as a **different-outcome context** even though the percentage is the same.
- A number absent from the original cannot pass verification. A number matched to an incompatible outcome context also cannot pass automated verification.
- Every matching number still requires human review for meaning, period, attribution and source ownership. None are auto-approved.
- Changes to original user-authored facts, working text, classification or unsupported numeric drafts reset earlier verification where required.
- Heuristic context checks do not guarantee semantic equivalence; unusual units or nonnumeric outcomes may require manual source inspection.

### JD keyword screening

- Read-only /api/profile/jd-match accepts pasted JD text in the authenticated candidate context. A bounded role-skill dictionary and explicit phrase variants find only terms **literally supported by original candidate-owned evidence**.
- Unmatched JD requirements remain gaps and never become skill tags. Source Router instructions, excluded records and negative guardrail contexts do not count as capability evidence.
- The user may explicitly insert an evidenced term into an **unsaved** tag draft, then inspect the original and save normally.
- The screen is not a role-fit score, does not save the raw JD and does not affect existing Stage 1/2/3 CV workflows.

### Regression and release conditions

- Standalone tests cover provenance, exact quotes, missing STAR parts, decimal/currency metrics, context mismatches, missing numbers, negative skill evidence, verified-status gates and JD candidate separation.
- The feature is still behind GARAMAAL_PROFILE_ENABLED=true. Profile writes additionally require APP_READ_ONLY=false and GARAMAAL_PROFILE_WRITES_APPROVED=true. No changes to live Cloud Run traffic, the Drive originals or the current CV generator.
- A **staging integration test** remains required: authenticate as both candidate profiles, import from the four Drive sources, review and save a STAR claim, confirm denial of unsupported numbers, paste a JD, and inspect the responsive UI in dark/light on desktop and phone.
- The Profile-to-CV evidence source switch remains **deferred** until a separate verified, versioned adapter with rollback has been tested.


## Stage 5 — access control, durable history, non-destructive Drive refresh (31 October 2026)

**Implemented in draft PR #99, not deployed.** Existing Make CV worker and original Drive files remain unchanged.

### Candidate-specific access control

The Profile API continues to require Firebase verified-email authentication through the existing Garamaal login allowlist. It now ALSO checks a private server-only JSON ACL before creating any profile Firestore reference, even for readiness and history calls.

Environment variable: GARAMAAL_PROFILE_CANDIDATE_ACL_JSON

Example value for illustrative accounts (replace with actual approved sign-ins, never commit actual emails or secrets):

    {"first-user@example.com":["abhishek"],"second-user@example.com":["pooja"],"approved-admin@example.com":["abhishek","pooja"]}

Explicit email-to-candidate grants are required; there are no wildcard users, public reads, client-supplied owner identifiers or role bypasses. Missing/invalid ACL denies profile access. The Firestore document owner is a SHA-256 digest of the verified signed-in email and the chosen, ACL-permitted candidate. This means candidate records are isolated by signed-in account; a future shared-team tenancy design must not assume that two different emails automatically share edits.

Firestore Admin SDK uses server IAM, bypassing mobile/web client Firestore Security Rules: **do not grant client-side direct access** to these profile collections. Scope the Cloud Run runtime identity and Firestore rules appropriately, restrict unauthorised access to sensitive career source/STAR data, and test cross-candidate denies in staging.

### Separate staging and production data

GARAMAAL_PROFILE_ENABLED=true alone is not enough to activate the Profile API. Require:

- GARAMAAL_PROFILE_DATA_SCOPE=staging for the isolated test service (Firestore collection: garamaalProfilesStagingV1). Production future scope is production (collection: garamaalProfilesV1). Scope unset fails closed.
- GARAMAAL_PROFILE_CANDIDATE_ACL_JSON set explicitly.
- GARAMAAL_PROFILE_WRITES_APPROVED=true plus GARAMAAL_PROFILE_STAGING_ISOLATED=true for staging writes. Keep APP_READ_ONLY=true there so existing Jobs/Sheets APIs remain read-only.
- For future production Profile writes, separate requirements: GARAMAAL_PROFILE_DATA_SCOPE=production, GARAMAAL_PROFILE_WRITES_APPROVED=true, GARAMAAL_PROFILE_PRODUCTION_APPROVED=true, and APP_READ_ONLY=false (requires its own explicit production release approval). **Do not enable these flags during Stage 5.**

Source IDs remain server-only. Profile API read-only operations are separate from writes. Never expose the ACL JSON content in logs, browser config, PRs or screenshots.

### Immutable version history

Every approved first import, edited record/section, and reviewed Drive refresh is stored atomically with a full immutable snapshot at a numbered candidate-owned Firestore versions subcollection path. Each snapshot includes revision, action, timestamp, actor email hash, record count, source digests and previous document contents. A legacy already-imported record is captured as a baseline during its first Stage 5 write.

Read-only API: profile/history lists at most the 20 most recent version headers; profile/history-version shows one selected candidate-owned snapshot. The UI lets a user inspect prior content. No silent rollback/restore is performed, and history remains accessible only with current candidate ACL access.

History storage is additive and can grow; staging testing should assess actual Firestore write costs, retention policy, document-size limits, GDPR data-deletion obligations and client privacy controls before production activation. Sensitive full history requires the same security protections as active profiles.

### Drive source refresh diff and reviewed merge

Endpoints: profile/refresh-preview (read-only), profile/refresh-apply (write-gated).

- Every refresh re-reads both authorised configured Drive source files; if a file ID changes, missing coverage is detected, the wrong candidate is selected or source data is a placeholder, import fails closed.
- A preview computes unchanged, added, text-changed and missing source records keyed by source type, configured file ID and evidence locator. It returns bounded old/new excerpts, an opaque source/revision fingerprint, and a decision UI. No data is written during preview.
- Each added record requires Accept or Skip; each text-changed record requires Replace or Keep; each missing original requires Archive or Keep. **Every changed item must be explicitly reviewed.** There is no silent default bulk overwrite.
- On Replace, the old source and all prior approved STAR overlays remain present in the Profile as inactive, non-CV-eligible audit records. A new evidence record is created with blank STAR/metrics approvals, needs-review status, and only a user-reviewed section assignment retained. On Keep, stale originals are kept but not eligible for the future CV engine. Missing records are not deleted.
- Unchanged original evidence retains its reviewed annotations. Candidate-added records and custom sections remain intact.
- The Apply request re-reads Drive, checks the existing Firestore revision and recomputes the same fingerprint inside the Firestore transaction. Any intervening user edit, source change or decision omission blocks the merge.
- The final reviewed profile and immutable version snapshot write atomically. Source-change previews over 300 modifications are blocked for an individually reviewed/manual migration workflow.

Original Drive source documents are **never modified** by this process.

### Staging prerequisite checks — execution pending

Use the read-only audit script in an authenticated Google Cloud Shell session:

    bash standalone/profile-staging-readiness.sh

If the service has a different name:

    GARAMAAL_STAGING_SERVICE=your-isolated-staging-service bash standalone/profile-staging-readiness.sh

The script inspects service metadata, missing Drive env variables, profile scope, ACL presence without showing its content, read-only control flags, default Firestore database and current traffic metadata. It does not deploy, set IAM, create Firestore data, alter environment variables or change traffic. It cannot itself prove access to Drive or Firestore: additionally test authenticated Profile readiness, candidate-authorised preview/import/save, cross-user denial, concurrency, history and actual refresh in a private staging service.

**Remaining permissions blockers:** This chat has access to GitHub code/tests but not authorised Google Cloud Run deployment, Cloud IAM roles, Firestore database configuration or a real test-browser session. No live Cloud Run/Drive/Firestore interaction has been performed. A successful CI run does not establish those permissions.

### Next Stage 6 (separate approval)

Implement a version-pinned, read-only evidence adapter in the Python CV worker that accepts **verified and CV-eligible** candidate Profile records, source hashes and approved STAR/metrics only. Preserve the existing Drive source as a guarded rollback. Run comparison builds before any profile-source cutover and never enable Profile writes or promote production traffic as a side effect.


### Stage 5 follow-up audit — metadata-only refresh and fail-closed reads

The final review identified and addressed three additional cases in the draft branch:

- **Stored-candidate mismatch**: Profile read now explicitly denies a document whose embedded candidate differs from the ACL-authorised candidate request. A malformed or misplaced document is never returned simply because the caller has access to the containing path.
- **Revision integrity**: History-version reads check that the stored revision and record-count metadata agree with the full snapshot. A mismatched stored version is rejected, not shown as authoritative history.
- **Source-version-only refresh**: The refresh planner compares current and incoming Drive source hashes separately from the extracted evidence-record text diff. If records are identical but a source hash changed, the UI offers an **explicit source version approval**, and the backend requires confirmMetadataOnly=true before recording a new profile revision and immutable history snapshot. No existing evidence, STAR overlay, or verification status changes in that case. A truly unchanged source remains a no-op.

New regression coverage is included in standalone/test/profile_stage5.test.js. All changes remain in the feature branch, behind the existing Profile and staging write gates. No Cloud Run configuration was changed here.

**Staging blockers still apply**: the connected GitHub tool can verify repository content and GitHub CI but cannot read actual Cloud Run service revision configuration, service-account Drive permissions, Firestore IAM, or perform an authenticated test-browser import. Run the read-only script bash standalone/profile-staging-readiness.sh in authorised Cloud Shell and then exercise authenticated staging readiness, import, versioned edit, refresh, and cross-candidate denial flows before considering a release.


## Stage 6 — read-only Profile-to-CV evidence adapter (31 October 2026)

**Draft branch only — not merged or deployed.** Stage 6 adds a separately composed, opt-in staging wrapper around the unchanged Python CV source builder. The protected production worker files and current GitHub Actions configuration stay byte-for-byte unchanged.

### Inspected legacy handoff

The worker continues to read the original candidate-specific Master Evidence Bank and Summary Router from Drive. Stage 1 independently analyses the raw JD. Stage 2 creates a STAGE2_HANDOFF with selected professional and project evidence keys. Python Sources.stage3() builds Selected_Evidence.md with exactly those IDs plus mandatory chronology, credentials and claim restrictions. Stage 3 consumes the file alongside the original approved Word templates. Full original Master Bank still supplies deterministic factual QA.

### Adapter and safe source modes

New staging-only Python modules: standalone/profile_cv_adapter.py (read-only pinned Firestore and eligibility checks) and standalone/staging_profile_cv_handoff.py (ProfileStage3Sources proxy around the legacy Sources.stage3). The protected src/automate_cv worker files remain unchanged, and the repository's protect-worker CI guard is not relaxed. An isolated staging orchestrator must explicitly wrap workflow.sources with ProfileStage3Sources before calling Workflow.run; the default worker does not import or activate this adapter.

- **Default**: GARAMAAL_CV_EVIDENCE_MODE=drive (or unset). This bypasses Firestore entirely and preserves the existing Stage 3 source package and CV output behaviour. No extra credentials or release configuration are required.
- **Opt-in staging comparison**: GARAMAAL_CV_EVIDENCE_MODE=compare. Reads one explicitly pinned, candidate-owned Firestore revision and writes only a local Profile_Evidence_Comparison.json coverage report (candidate, revision, selected/approved/missing IDs and source hashes). The model still receives the unmodified Drive Selected_Evidence.md.
- **Explicit staging cutover**: GARAMAAL_CV_EVIDENCE_MODE=profile, with GARAMAAL_PROFILE_CV_CUTOVER_APPROVED=true. Replaces the local Stage 3 selected evidence file with only reviewed Profile records that match the Stage 2 selected IDs. Any missing/unreviewed key fails before a paid Stage 3 model call. The original Drive Selected_Evidence.md is copied locally to Drive_Selected_Evidence.md for comparison and rollback. The original source QA continues to use the Drive Master Bank.
- Both nondefault modes require GARAMAAL_PROFILE_DATA_SCOPE=staging and GARAMAAL_PROFILE_CV_STAGING_ISOLATED=true. The staging adapter deliberately cannot read production profile collections or activate itself as part of currently configured GitHub Actions workflows.
- Invalid modes, owner IDs, versions, unsupported credentials, missing evidence or mismatched candidate provenance cause explicit failures, not silent fallback. To roll back, unset GARAMAAL_CV_EVIDENCE_MODE or set it to drive.

### Explicit configuration for isolated staging only

- GARAMAAL_PROFILE_CV_GCP_PROJECT = the approved staging Google Cloud project containing the Firestore database.
- GARAMAAL_PROFILE_CV_OWNER_DIGEST_ABHISHEK and GARAMAAL_PROFILE_CV_OWNER_DIGEST_POOJA = the 64-hex SHA-256 digest of the corresponding approved Firebase login email, exactly matching the server-side Stage 5 owner path. Set only for candidates being tested. Never commit actual login addresses, owner digests or credentials.
- GARAMAAL_PROFILE_CV_REVISION_ABHISHEK / GARAMAAL_PROFILE_CV_REVISION_POOJA = explicit positive pinned snapshot revisions.
- The staging execution identity needs Google Application Default Credentials (ideally short-lived Workload Identity Federation) with only the read access required for that staging Firestore collection. The adapter uses an authenticated Firestore REST GET to read the candidate document and the 10-digit-padded immutable version document. It does not make any database writes or accept user-supplied path components.
- A production job remains Drive-only regardless of these staging flags unless a separate isolated staging runner deliberately installs the ProfileStage3Sources proxy. The adapter cannot activate by environment variable alone in the protected worker.

### Evidence policy

Only original Master Evidence Bank records with the configured source file ID can enter the Profile-selected package. Each must be CV-eligible, verified, classification-reviewed, and have all detected metrics reviewed. Router, guardrail/other, duplicate, superseded, missing and source-drift records are excluded. Independently re-check that user-edited STAR/working text/bullets do not introduce new numeric values absent from original evidence. Reviewer-added keyword tags appear only when literally present in the original source. Include the Profile revision, master source SHA-256, source locator, evidence ID and source line span with each accepted record.

**Transitional limitation:** Stage 2 still selects keys from the Drive Summary Router. The staging Profile package temporarily preserves mandatory chronology, credentials and guardrail sections from the original Drive package; these remain clearly labelled as legacy source context. Do not treat them as newly verified Profile achievements. Stage 7 must validate the final Profile-owned chronology/credentials workflow before declaring Profile the sole source.

### Tests and release gates

Tests: tests/test_profile_cv_adapter.py (mock Firestore REST, no network), existing tests/test_sources.py, tests/test_pooja_sources.py, tests/test_workflow_resume.py, and the full Python/JS CI suite. They cover default Drive behaviour, staging-only flags, pinning, candidate ownership, exact evidence IDs, omission of unreviewed claims, unsupported numbers and keywords, source rollback and the transitional mandatory context.

**Not performed:** no real staging Workload Identity Federation / Firestore ADC read, approved human review of imported records, actual CV/CL comparison generation, visual staging browser verification or production release. No configuration flags, GitHub Action secrets, IAM settings, Cloud Run traffic or Drive originals were modified.

Before enabling compare or profile, complete Stage 5 staging credential validation and a representative set of reviewed Master Evidence records for each candidate. The Stage 7 gate must compare resulting CV documents, ATS fit and factual QA side by side with the Drive baseline and preserve a tested rollback before any production source cutover.


### Repository safeguard outcome

The existing Garamaal UI CI guard intentionally rejects changes to src/automate_cv outside an earlier narrow job-discovery allowlist. An initial Stage 6 integration attempt correctly tripped this safeguard. Rather than weaken or bypass it, all edits to protected worker files were reverted to their main-branch originals; the adapter and integration proxy were moved to standalone. The original worker and CI guard remain intact. Stage 7 must use a separately reviewed staging runner and test plan before contemplating any approved CV worker migration.
