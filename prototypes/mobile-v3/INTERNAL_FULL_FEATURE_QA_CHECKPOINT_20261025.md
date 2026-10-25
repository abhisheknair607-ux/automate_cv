# Garamaal — Full-Feature Internal UI QA Checkpoint

**Branch:** `prototype/mobile-v3-connected-qa-20261025`  
**Date:** 25 October 2026  
**Status:** Pushed to isolated prototype only. No merge, no live deployment, no production data writes or paid API calls.

## 1. Visual freeze and scope

- The approved HOME, all four illustrated buttons, both five-tab bars, Back button and profile drawer are **frozen**. New shared styling targets only inner Jobs/Social content.
- The prior standalone HTML download was a **reduced design fixture**, not a full-feature application. Do not evaluate feature parity from that download.
- The full Jobs source `webapp/Index.html` is unchanged, blob `765acba0e663e291545f3ceb3083178a92431646`.
- The full Social source `standalone/social.html` is unchanged, blob `99b0fd9046c52ac2701e54ca3383c9597340c0ee`.
- Jobs `/prototype` composes the original Jobs document and handlers. Social `/social?gmv3=1` decorates the original Social document, preserving its native navigation.

## 2. Feature contract verification

| Area | Checks | Outcome |
|---|---|---|
| Discovery job card | Original card renderer executed with sample data; Paste JD/detail, preference, bulk selection, stage badges and link | PASS, source-backed simulation |
| Make CV job card | Original card renderer executed with sample data; Selected/CV/CL/Web, Run CV Now UI, networking, detail, model selectors and application status | PASS, source-backed simulation; **no CV run** |
| Full Jobs control inventory | JD save/transfer/sync, status/details, download, prompt, sorting, paging and bulk preference handlers present | PASS, source assertions |
| Social | Original Targets, Research, uploads, Swipe, Follow-ups, stats and candidate switching present | PASS, source assertions |
| Both five-tab navigations | Delegate to original view handlers; new Jobs Swipe decision actions disabled | PASS, source assertions |
| Visual freeze | Compared prototype branch against preceding motion-QA branch; no changes to original approved artwork/nav/home/drawer files | PASS, Git diff |
| Shared internal CSS | Does not target approved home/bar/back/drawer selectors; does not hide original controls | PASS, source contract |
| Offline browser fixture | Chromium screenshots at 320/390/768 px show four home buttons and five footer labels; no horizontal overflow or JS exceptions | PASS, **fixture only** |

The new `standalone/mobile_fullfeature_parity.test.cjs` contains eight regression tests. Their assertions were evaluated in an isolated source-backed simulation with mocked Node built-ins and all eight passed. A **real Node test execution on a checked-out repository remains pending**.

## 3. Code changes

- NEW `standalone/mobile_design_language.css`: common internal cards, typography, filters, forms, badges, actions and responsive density.
- NEW `standalone/mobile_fullfeature_parity.test.cjs`: original Discovery/Make CV card rendering, Social source, five-tab delegation, CSS freeze checks.
- MODIFIED `standalone/server.js`: load the new CSS only on `/prototype`.
- MODIFIED `standalone/social_server.js`: load the new CSS only on `/social?gmv3=1`.
- MODIFIED `Dockerfile.social`: package shared CSS for the opt-in Social test route.
- UNCHANGED: original `webapp/Index.html`, `standalone/social.html`, CV worker, existing API handlers, credentials and production.

## 4. Limits and blockers

- No authenticated **isolated Cloud Run staging** service was started or deployed. Full backend-integrated browser QA is not verified.
- The deployed revision and SHA at `garamaal.web.app` have not been reconciled to GitHub. Parity was verified against the preserved repository source—not independently against the live deployed build.
- The offline screenshot fixture has simplified mock listings. These screenshots do **not** prove that real job-card controls render at mobile widths.
- Real OAuth, Sheets, Research upload, candidate separation, Drive downloads, API permissions and network failures remain untested in a connected environment.
- No paid CV-generation or preference/status writes were performed.

## 5. Next gated verification

1. Run `node --test standalone/mobile_fullfeature_parity.test.cjs` and existing route tests in a checked-out branch sandbox; install dependencies without relying on `npm ci` if `package-lock.json` remains absent.
2. Start both original Jobs and Social services read-only, with test credentials that cannot mutate production.
3. Capture **real internal screens**, not the mock fixture, at 320/390/768px: Discovery full listing actions, Make CV model/status controls, Add Job, Social Targets filters, Research, people Swipe and Follow-ups.
4. Confirm every original control is present and usable. Resolve spacing/overflow without editing feature logic.
5. Verify the actual live deployment SHA before claiming 100% live feature parity.

**Nothing is approved for merge or production deployment.**