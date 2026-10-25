# Garamaal Mobile V3 — Stage 2 Navigation & Feature Preservation

**Status:** Pushed to isolated prototype branch; review checkpoint, not deployed.
**Date:** 25 October 2026
**Branch:** \`prototype/mobile-v3-feature-parity-20261025\`
**Base:** \`fix/jobs-live-header-overlay-guarded-20261020\`
**No API generation, database migration, production deployment or merge.**

## Stage 2 summary

The previous downloadable standalone HTML was an incomplete UI demo. The new branch instead uses the COMPLETE original Jobs \`webapp/Index.html\` (including Discovery, Make CV, Add Job, filters, model tiers, CV queue, statuses, documents, ranking prompt and contacts) and the COMPLETE original Social \`standalone/social.html\` (including Targets, Research, people Swipe, accepted contacts, follow-ups, templates and uploading).

**Neither source HTML file is edited.** The prototype injects navigation and CSS selectively, preserving legacy handlers. Existing auth, Sheets and Drive services are not modified.

## Routing diagram

\`\`\`text
                       [ Firebase Hosting ]
                                |
           +--------------------+-------------------+
           |                                        |
  /prototype (Jobs service)                 /social?gmv3=1 (Social service)
           |                                        |
  Original Jobs + same bridge                Original Social + OAuth bridge
           |                                        |
  New five-tab Jobs footer                   New five-tab Social footer
           |                                        |
 Dashboard · Discovery · Swipe             Targets · Research · Swipe
 Make CV · More                              Follow-ups · Stats
           |                                        |
 Dashboard: native nav("dashboard")         Targets: native data-view=dashboard
 Discovery: native nav("discovery")          Research: native data-view=inbox
 Swipe: new READ-ONLY sample UI             Swipe: native data-view=swipe
 Make CV: native nav("fresh")                Follow-ups: native data-view=followups
 More: native Add Job nav("add")             Stats: original stats() read-only
           |                                        |
               All original sources/feature APIs remain intact
\`\`\`

The **existing production paths** \`/\` and unflagged \`/social\` render exactly their previous HTML. The new UI is opt-in via the two paths above, and only after deploying a staging/test build to the appropriate Jobs/Social services (not done).

## What changed

- **Jobs navigation:** bottom Dashboard | Discovery | Swipe | Make CV | More. Calls the actual \`nav()\` function. Original search, filters, sorting, Make CV, model tiers, application statuses, file download and Add Job remain.
- **Jobs More:** Add Job, Job statistics (original Dashboard), Discovery filters, ranking prompt, Social Hub and Home. No hidden writes.
- **Jobs Swipe:** a clearly labelled fictional read-only vacancy card with three-point summary and expandable JD. Left/right choice controls are intentionally disabled. There is no discovery/JD live data query and no interested/not-interested record creation. Stage 3 will design the user-owned data contract and eligibility filters.
- **Social navigation:** Targets | Research | Swipe | Follow-ups | Stats. Four feature buttons click the unchanged original Social nav nodes to invoke the same handlers. Research continues loading through the existing \`loadResearch()\` and \`loadInbox()\` flow.
- **Social Stats:** an additional overlay that reads **existing** in-session \`stats()\` (contacts, requests, accepted, follow-ups due) without making a new request or writing anything.
- **Appearance:** mobile 44px tap targets, a centered elevated Swipe button, compact top header, bottom safe-area padding, no duplicate mobile navigation, compact cards and small headings. Original forms, filters and state are not replaced.
- **Home navigation:** “Network” now opens \`/social?gmv3=1\` on the Social service. Back returns to \`/prototype\`.

## Source files

| File | Change | Scope |
|---|---|---|
| \`webapp/Index.html\` | None | Original Jobs UI and all features |
| \`standalone/social.html\` | None | Original Social UI and all features |
| \`standalone/server.js\` | Add /prototype CSS/JS routes and inject Jobs footer | Prototype-only |
| \`standalone/social_server.js\` | Conditional HTML decoration when query \`gmv3=1\` | Unflagged /social unchanged |
| \`standalone/mobile_home_shell.js\` | Network button points to flagged Social route | Prototype only |
| \`standalone/mobile_hubs.css\` | NEW | Scoped navigation and overlay styling |
| \`standalone/mobile_jobs_hub.js\` | NEW | Jobs tab routing and disabled preview Swipe |
| \`standalone/mobile_social_hub.js\` | NEW | Social tab routing and read-only Stats |
| \`standalone/mobile_hubs.test.js\` | NEW | Structural and behaviour regression tests |
| \`standalone/mobile_home_shell.test.js\` | Updated expectation for flagged Social route | Tests only |

Baseline Git blob SHAs:
- Jobs: \`765acba0e663e291545f3ceb3083178a92431646\`
- Social: \`99b0fd9046c52ac2701e54ca3383c9597340c0ee\`

## Non-regression checklist

- [x] Full existing Jobs and Social HTML remain byte-identical.
- [x] Original \`/\` route retains the same handler; Social \`/social\` route still \`sendFile\` when not flagged.
- [x] Auth, OAuth, Sheets, Drive, CV generation and Social write paths remain untouched.
- [x] Jobs Dashboard, Discovery, Make CV and Add Job buttons delegate to original \`nav()\`.
- [x] Jobs Swipe never writes preference, spreadsheet status, CV queue or user data.
- [x] Social Targets, Research, Swipe and Follow-ups buttons delegate to original navigation.
- [x] Social Stats calculates counts from original authorized \`stats()\`.
- [x] Direct JavaScript syntax checks and simulated route/nav behaviour performed.
- [ ] Actual Node integration run via checked-out branch and dependencies.
- [ ] Browser visual QA on Android/iOS, small 320px viewport, 390px/430px devices, tablet and desktop.
- [ ] Real OAuth/Sheets read-only staging smoke tests, valid identities and candidate-switch regression.
- [ ] Verify Cloud Run revisions, hosting rewrites and separate-service preview routes before any staging deploy.
- [ ] Explicit user approval for Stage 3 and a secure per-user interest storage model.

## Local tests and setup

From a cloned checkout of this branch:

\`\`\`bash
npm ci
node --test standalone/mobile_home_shell.test.js standalone/mobile_hubs.test.js
npm start
# Open http://localhost:8080/prototype
\`\`\`

Note: Social is independently hosted in production. Its opt-in route is implemented in \`standalone/social_server.js\`. A local \`npm start\` runs the Jobs service, which also exposes a fallback legacy \`/social\` route; it does **not** exercise Social-service conditional injection. Testing the actual Social opt-in route requires running the Social service in a separate staging process or using the test's route simulation. **Do not deploy or alter Firebase rewrites without a reviewed staging plan.**

## Stage 3 proposal — gated

Add an eligibility-based read-only Jobs Swipe feed backed by Discovery rows only where complete JD is confirmed, then user-owned interested/not-interested choices with strong isolation and explicit idempotent writes. No automatic CV generation on right swipe. Verify field mapping, filters, backend ownership, and cost controls before enabling any write. Preserve all existing Jobs/Social functionality throughout.

**Stage 2 is complete as a GitHub UI-implementation checkpoint. It is NOT live-verified, deployed, merged or production-ready.**
