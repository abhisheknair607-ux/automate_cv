# Garamaal Profile — Stage 7 staging validation and release gate

31 October 2026 — draft PR #99 — NOT a production approval.

## Verified Drive originals (connected user identity, not Cloud Run)

| Candidate | Source | Modified |
|---|---|---|
| Abhishek | MASTER EVIDENCE BANK.docx | 27 Sep 2026 |
| Abhishek | SUMMARY DOC.docx (compact evidence router) | 27 Sep 2026 |
| Pooja | POOJA_MASTER_EVIDENCE_BANK_FILE_ID - Master Evidence Bank.docx | 14 Oct 2026 |
| Pooja | POOJA_SUMMARY_DOC_FILE_ID - Summary Doc.docx | 14 Oct 2026 |

All four metadata reads returned accessible Word files. This proves access by
the connected Drive account only. It does not prove Cloud Run service-account
permission, active staging configuration or latest Google Actions variables.
Reconcile file IDs privately; reject placeholders and duplicate backups.

## Prerequisites: isolated staging identity

1. Choose a staging Cloud Run service/revision separate from production
   traffic, with a nominated staging service identity. No traffic changes.
2. In an authorised Google Cloud Shell session use the read-only script:

       GARAMAAL_STAGING_SERVICE=YOUR_STAGING_SERVICE \
         bash standalone/profile-staging-readiness.sh

   It checks service identity, nonsecret variable presence, staging scope,
   read-only gates and Firestore database metadata. It does not change
   traffic, IAM, APIs, Firestore documents or Drive files.
3. Verify that Cloud Run's ACTUAL service account can read all four approved
   Drive files. Do not widen file sharing publicly.
4. Confirm the Firestore (default) database and staging collection
   garamaalProfilesStagingV1, with least privilege for the service identity.
   Admin SDK calls bypass client Firestore rules; enforce server ACL.
5. Configure verified sign-in email/candidate ACL server-side. No wildcard
   grants. Test untrusted user, unauthenticated request and cross-candidate
   denials for both read and write. Never return owner digests to clients.
6. Run authenticated candidate-specific profile readiness and source preview
   against staging only. Approve staging Profile writes separately after
   read-only checks; keep unrelated Jobs/Sheets write controls unchanged.

## Controlled staging Profile checks

All checks need recorded pass/fail and private test evidence.

| Test | Required acceptance |
|---|---|
| Two candidates import independently | Each has correct Master Bank and router |
| Source fidelity | Extracted text complete; sampled original passages match |
| Editing | Original evidence preserved; working text, STAR and sections save |
| Metric validation | Unsourced numbers and incompatible numeric outcomes denied |
| Revision history | Pinned version, source digest, actor and candidate are consistent |
| Concurrency | Stale saves rejected without overwriting another edit |
| Source refresh | All changes reviewed, source-version-only updates approved |
| Candidate security | Unauthorized cross-candidate reads and writes blocked |
| Desktop and mobile | Dark/light, keyboard focus, source links and editor controls work |
| Rollback | Disable Profile and restore previous UI without Jobs/Social/CV impact |

No live browser or Cloud Run test has been completed from this conversation.

## Staging CV and cover-letter comparison

The ordinary production worker remains byte-for-byte unchanged. The
staging-only adapter supports Drive default, read-only Profile comparison
and explicitly approved Profile package substitution. A separate isolated
staging runner must deliberately install ProfileStage3Sources from
standalone/staging_profile_cv_handoff.py. Flags on the ordinary production
worker DO NOT activate the adapter.

The transitional staging package still uses Drive chronology, credentials
and claim guardrails; the Profile is NOT yet the sole source of CV facts.

Only with explicit separate approval, generate candidate-owned Drive and
Profile Word CVs and cover letters for a controlled set of test JDs in a
private staging directory. No paid generation was performed in this stage.

Compare already-generated Word outputs locally with:

    PYTHONPATH=src:. python -m standalone.profile_stage7_compare \
      --drive-cv /private/staging/drive-cv.docx \
      --profile-cv /private/staging/profile-cv.docx \
      --drive-cl /private/staging/drive-cl.docx \
      --profile-cl /private/staging/profile-cl.docx \
      --jd-file /private/staging/job-description.txt \
      --report /private/staging/cv-comparison.json

This tool does not write to existing Word files or make network calls.
Its report flags added/removed numbers, JD vocabulary coverage and Word
structure changes. It does not produce an ATS score or a reliable rendered
page count. Manually inspect CV and CL results side-by-side, verify every
material outcome against original evidence, and render the files to inspect
actual page count, typography, margins and line breaks.

## Release blockers

- [ ] Cloud Run staging service/identity and Firestore IAM confirmed.
- [ ] Four correct source IDs reconciled; service identity reads each.
- [ ] Candidate ACL, Firebase authentication and denied cross-candidate
      actions validated in isolated staging.
- [ ] Original imported source text and revision history verified for both.
- [ ] Profile editing and mobile/desktop interaction reviewed in staging.
- [ ] Staging Profile cutover uses reviewed evidence for every selected ID.
- [ ] Real CV/CL pairs for both candidates evaluated with factual QA,
      supported metrics, JD relevance and rendered document layout.
- [ ] Verified rollback to original Drive source and previous Profile UI.
- [ ] GitHub CI, protected worker guard and Jobs/Social checks remain green.
- [ ] Explicit separate approval received BEFORE any merge or traffic change.

## Known limitations

- Connected GitHub and Drive tools cannot inspect the active Cloud Run
  runtime identity or Firestore IAM and cannot perform authenticated
  browser tests. Runtime tests need authorised staging Cloud Shell and
  candidate login.
- Numeric-context rules are heuristic and do not prove every claim.
- The profile-to-CV staging wrapper is NOT installed in normal automation.
- Actual CV/CL output has NOT been generated or inspected from staging.
- No production deployment, IAM mutation, Drive write, paid generation,
  PR merge or traffic change occurred in Stage 7.

Next: staging access audit -> authenticated Profile smoke tests -> private
CV/CL comparison -> human signoff -> separate production release approval.
