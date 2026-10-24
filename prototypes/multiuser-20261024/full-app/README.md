# Garamaal — Complete Web App, Multi-User Design Copy

**Stage:** 2 — Mobile-first UI/UX review built on Stage 1  
**Status:** Stage 2 implementation ready for device visual review (not deployed or backend-connected)  
**Date:** 24 October 2026  
**Branch:** `prototype/multiuser-profile-plan-20261024`

> Important: All edits are NEW FILES under `prototypes/multiuser-20261024/` on this isolated branch. The original `webapp/Index.html`, `standalone/social.html`, server, worker, sheets, Drive evidence and deployments have not been changed. The prototype must NOT be deployed as production.

## Current checkpoint: Stage 2 — Mobile UI/UX review

- [**Stage 2 UX change log, responsive diagram and review checklist**](./STAGE2_UX_REVIEW.md)
- [Stage 2 smoke-test source](./stage2-smoke.test.cjs) (run in a checked-out branch with Node: `node --test prototypes/multiuser-20261024/full-app/stage2-smoke.test.cjs`)
- Refined safe-area mobile navigation, More menu, collapsible Work Experience / STAR fields, job-specific ChatGPT score import and immersive desktop Jobs integration.
- Social has fictional, read-only sample contacts. **Real Google/Firestore/OpenAI services remain unavailable in this copy.**
- The items below record the original Stage 1 baseline and remain part of the change history.

## Files

| File | Purpose | How complete? |
|---|---|---|
| [index.html](./index.html) | Mobile-first unified shell, account simulation, dashboard, Profile, Rankings, Usage & Account | UI review implementation; no live API |
| [jobs.html](./jobs.html) | Full Jobs dashboard source copy with isolated read-only/demo modifications and same controls | Existing UI preserved; real data/writes disabled |
| [social.html](./social.html) | Full Social Hub source copy with isolated no-network bridge and same Research / Swipe / Follow-up screens | Existing UI preserved; real data/writes disabled |

**How to open:** Download the branch contents using GitHub's Code → Download ZIP, extract the folder, then open `prototypes/multiuser-20261024/full-app/index.html` in your browser. **Keep all three HTML files in the same directory.** GitHub's code viewer displays source; it is not itself a hosted interactive preview. Some browsers restrict local iframes; serve the three-file folder with a simple static local server if required. No Firebase or Cloud Run configuration is needed to inspect this design copy.

## User journey / planned hierarchy

```text
[ Welcome / Google sign-in mock ]
               |
               v
[ Firebase Auth UID + invite + consent ]  <-- future, NOT implemented
               |
               v
      [ My Dashboard ]
            |
            +---- [ Jobs original feature page ]
            |         ├─ Overview
            |         ├─ Discovery
            |         ├─ Make CV
            |         └─ Add Job
            |
            +---- [ Profile ]
            |         ├─ Work Experience → repeatable STAR evidence
            |         ├─ Education
            |         ├─ Achievements
            |         ├─ Interests and Career Goals
            |         └─ Skills
            |
            +---- [ My Rankings ] → own ChatGPT prompt / score import
            +---- [ Social original feature page ]
            |         ├─ Dashboard / targets
            |         ├─ Research screenshots / text
            |         ├─ Swipe / connect
            |         └─ Follow-ups / templates
            |
            +---- [ Usage & Credits ]
            +---- [ Account, privacy & connections ]
```

## Design rules

- **Build on top** of the existing Garamaal Jobs and Social layouts. Both original HTML interfaces were copied in full and only sandboxed for preview. The shell does not replace either with a reduced imitation.
- **Mobile first:** minimum 44 px touch targets, comfortable reading widths, adaptive single-column forms on small screens, sticky header and five-item bottom navigation with an Account/More escape route. Large screens get a persistent sidebar.
- **No cross-user assumptions:** login personas `sample-a`, `sample-p`, and `sample-n` are independent browser-memory models. This is **not** real user isolation/security: the eventual Cloud Run API MUST verify Firebase tokens and enforce resource ownership server-side.
- **No automatic AI fees:** all generated evidence in this prototype is user-editable sample text. The actual OpenAI API is not contacted, nor is any payment processor.
- **One employer/role per card:** preserves original notes; separate optional metric value, unit/timeframe, evidence provenance, STAR result and preferred final bullet per achievement. A single massive textbox is available only as an eventual import route.
- **Keep score provenance private:** job catalogue may be shared but profile fit, career fit, rationale, rank, status, contacts and credits must be user-owned. The 55/45 weighted score is recalculated from returned values.
- **Include failed-task costs:** proposed credit reservation, actual execution/compute/API usage, retry/partial failure accounting, refund/reconciliation and server-imposed caps. Payment shown here is not functional.
- **No automated LinkedIn sending or scraping:** manual research / review / connection workflows remain the operating model.
- **Privacy:** source files and user documents must not enter public GitHub. Only sample placeholder data is used in this prototype.

## Stage 1 acceptance checklist

- [x] Created isolated GitHub prototype branch from the Firebase-based Jobs frontend release branch.
- [x] Copied original Jobs HTML; `DEMO=true`, added no-network CSP and a parent-shell navigation listener.
- [x] Copied original Social HTML; replaced its network bridge with a read-only stub and added no-network CSP.
- [x] Added a responsive unified shell and sample sign-in page.
- [x] Added Dashboard Profile-completeness card, five structured Profile editor sections, ranking import, usage and account.
- [x] Local static JavaScript compile and simulated render checks passed for all shell pages and five Profile sections.
- [x] Confirmed GitHub comparison shows **added prototype files only**, no changed working source files.
- [ ] Human visual review on actual Android, iPhone-sized viewport and tablet.
- [ ] Confirm browser workflow through the three-file copy, including embedded Jobs/Social and navigation, using an actual web browser.
- [ ] Verify exact live Cloud Run and Firebase release SHA before preparing a staging implementation.
- [ ] Approve UI copy, positioning of original “Next move” controls, profile evidence fields and account onboarding.

## Known boundaries and Stage 2 plan

Stage 1 is a **visual/interaction design prototype**, not the migrated product. The original Jobs and Social HTML is functionally complete only against its real backend; this preview intentionally disables those requests, so screenshots and mock interactions are not proof of live end-to-end functionality. No actual Google sign-in, Firestore permissions, per-user payments or OAuth-connected ChatGPT write tools are implemented here.

**Stage 2** is detailed UX review and design refinement, then a deliberately separate security/data foundation: Firebase UID mapping, strict Cloud Run ownership checks, staging Firestore security rules, versioned career evidence records, migrated Abhishek/Pooja records and a test matrix for account isolation. **Do not carry forward the legacy A/P candidate selector as an access control mechanism.** Preserve both original pipelines during migration.

## Links

- [Architecture & Implementation Plan](https://docs.google.com/document/d/1z3pbM4Jf3QMJhL8WdAy-4wZ_2q2_Yr9ixqy9BEbzm5M/edit)
- [Future Plans & Change Archive](https://docs.google.com/document/d/1zWEHIdaI3iRvFwm6vRbT7M1iwtWDZrU4tIbpn4zHBi4/edit)
- [Project planning folder](https://drive.google.com/drive/folders/11A-9bgmcvnqdZb5dStZ92A_pSEMH0fyy)

**No production deployment. No paid OpenAI calls. No main-branch merges.**
