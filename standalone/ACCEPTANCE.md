# Automate CV — migration acceptance and rollback

**Not a production cutover.** Existing Apps Script, its Code.gs, Index.html,
GitHub schedulers, Python CV worker, Taaza, and Freshmaal stay untouched.

## Phase 0: Automated checks
- [x] Existing 14 exposed operations accounted for in compatibility layer
- [x] Existing UI and Apps Script syntax checked
- [x] Candidate-specific spreadsheet fields inherited from the original source
- [x] Unexpected API operations rejected
- [x] Pilot blocks mutations and paid GitHub dispatch by default
- [ ] Production Cloud Run image builds, boots, and authenticates successfully
- [ ] Both Google accounts verified with live Firebase sign-in

## Phase 1: Read-only LIVE data (APP_READ_ONLY=true)

Service account requires Viewer access to Taaza and Freshmaal. No changes
to production sheet contents are permitted in this stage.

- [ ] Abhishek and Pooja can sign in using Google, in the same normal Chrome profile
- [ ] Session persists across browser restarts when browser storage is enabled
- [ ] Third-party Google account is refused by server allowlist
- [ ] Desktop and mobile dashboard match original visual layout
- [ ] Job counts, job details, searches, pagination, sorting match original
- [ ] Jobs master and dynamically discovered TP Europe/Pooja Europe tab filters work
- [ ] Common-only jobs remain distinct; new and renamed tabs retain sheet IDs
- [ ] Not Interested hidden from normal browse and visible only in dedicated filter
- [ ] Candidate-specific Not Interested settings stay isolated
- [ ] Make CV status, rank, score, selection, tier and checkboxes match
- [ ] Unapplied shows CV-complete, non-Applied jobs only
- [ ] Existing CV download links work for each candidate
- [ ] Copy Prompt reads post-CV AH/AI only after selected candidate's CV exists
- [ ] All write operations return Read-only pilot error, with no live sheet edits

## Phase 2: Write operations only on DATED WORKING COPIES

Create separate Taaza and Freshmaal working copies and share only the copies
with the staging service identity as Editor. Use the working-copy IDs and
APP_READ_ONLY=false ONLY ON STAGING, never production during this phase.

- [ ] Add job with full JD, location, deadline and salary; duplicate refusal
- [ ] Edit JD and standard fields; stale row/JD update checks
- [ ] Transfer to Freshmaal, verify destination values and source status
- [ ] Bulk transfer limit, incomplete JD skip, duplicate detection
- [ ] Both candidates' independent Not Interested and Restore across sheets
- [ ] All CV/CL/web/selected controls and status/model tier validation
- [ ] New/renamed specialist tabs, shared category membership in Jobs P
- [ ] New master sync never triggers automatic CV action in column K
- [ ] A generated CV has candidate-specific copy prompt and Word download
- [ ] Paid manual CV dispatch must NOT be tested without separate authorisation
- [ ] Row locks, stale values and concurrent update handling pass

## Phase 3: Reliability, security and cost

- [ ] No secrets stored in frontend, source files or repository
- [ ] Cloud Run min instances 0, max instances 1; verify scale-to-zero
- [ ] No OpenAI key or paid CV operations required for a read-only smoke test
- [ ] Billing budget alerts set before enabling chargeable services
- [ ] Normal signed-in browser and mobile usage tested
- [ ] Existing GitHub workers still complete and produce downstream outputs
- [ ] Account sign-out and switch work
- [ ] Error logs exclude tokens and candidate document content

## Phase 4: Explicit sign-off and rollback

- [ ] Abhishek approves the new app
- [ ] Pooja approves the new app
- [ ] Latest live spreadsheet backups verified
- [ ] No outstanding must-fix parity discrepancies
- [ ] Only then point the replacement at production sheets and enable writes
- [ ] Keep Apps Script available as rollback; do not delete prior deployment
- [ ] Confirm successful real task before retiring old app

On any unexpected failure: revert the new service to read-only and return to
the original Apps Script URL. Never modify the old app merely to test the new.
