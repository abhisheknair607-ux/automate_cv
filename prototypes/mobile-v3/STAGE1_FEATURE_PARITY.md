# Garamaal Mobile V3 — Stage 1: Feature-Preserving Prototype

**Status:** Code committed and staged route tested by simulation. Browser/device QA still pending.  
**Branch:** \`prototype/mobile-v3-feature-parity-20261025\`  
**Base:** \`fix/jobs-live-header-overlay-guarded-20261020\`  
**Live release:** No merge, no build/deploy, no production change.

## Goal and architecture

The earlier standalone downloaded HTML was a reduced *mock*: it did not contain the original Jobs, CV automation, Social Research or connection management. **This branch is deliberately based on the real source, not on that demo.**

\`\`\`text
                /prototype         (NEW — stage-only route)
                     │
     [ Neon first-screen launcher ]  ← CSS, JS and markup in standalone/
        Profile | Apply Jobs | Network | Statistics
                     │                │
             Apply Jobs               └───────────────> /social
                     │                                  │
             [ original Jobs ]                  [ original Social ]
                     │                                  │
          Dashboard, Discovery                Targets/dashboard
          Make CV, Add Job                    Research, person Swipe
          filters, CV workflows               Follow-ups, templates
                     │                                  │
              Existing Cloud Run / Sheets / auth services
                     │
              No backend or feature-logic edits
\`\`\`

The **existing root \`/\`** and **existing \`/social\`** routes are unmodified. The \`/prototype\` route reads the same unmodified \`webapp/Index.html\` as \`/\`, injects the **same** \`/bridge.js\`, \`/dashboard-ranking.js\` and \`/dashboard-connections.js\`, and adds a separate action-first home. The original Jobs HTML and user interaction events remain in place under that launcher.

### New files

- \`standalone/mobile_home_landing.html\` — reference-inspired four action home and tiny Targets/Reminders chips.
- \`standalone/mobile_home_shell.css\` — mobile/desktop responsive styling scoped to the new route, neon lime, violet, white, black.
- \`standalone/mobile_home_shell.js\` — launcher/controller; calls the original \`nav('dashboard')\` rather than replacing the Jobs screen, uses the actual \`/social\` route for Network.
- \`standalone/mobile_home_shell.test.js\` — dependency-free integration and invariant tests for hash equality, runtime route composition and launcher interactions.
- \`standalone/server.js\` — additive CSS, JS and \`GET /prototype\` routes only.

### Feature parity — explicit non-change contract

| Original feature | Preservation status |
|---|---|
| Jobs Dashboard and Next move | **Unchanged source** — open via Apply Jobs |
| Discovery filters / sorting and job list | **Unchanged source and backend calls** |
| Make CV filters, application actions and queue | **Unchanged source and backend calls** |
| Add Job and JD intake | **Unchanged source and backend calls** |
| CV model presets and generated document links | **Unchanged source and backend calls** |
| Job rankings and contacts injected by Cloud Run | **Original \`dashboard-ranking.js\` and \`dashboard-connections.js\` still injected** |
| Social Dashboard/Targets | **Unchanged original \`/social\` route and source** |
| Social Research upload/intake, person Swipe and Follow-ups | **Unchanged source and backend calls** |
| Abhishek/Pooja candidate switch | **Preserved as legacy UI; this is NOT actual multi-user access control** |
| Server API routes, workers, Firebase and Cloud Run configs | **Not modified** |

**Verified original Git blob SHAs:**
- \`webapp/Index.html\`: \`765acba0e663e291545f3ceb3083178a92431646\`
- \`standalone/social.html\`: \`99b0fd9046c52ac2701e54ca3383c9597340c0ee\`

## What Stage 1 actually adds

- Home screen inspired by the supplied image: bold question, lime/white/purple action tiles in the order **Update profile → Apply jobs → Network → Statistics**, then **START YOUR JOURNEY**.
- **Apply jobs** enters the *full original Jobs Dashboard*, preserving its current navigation. A small back button is added only on the \`/prototype\` route.
- **Network** opens the *full original Social Hub* at \`/social\`. Browser back returns to the prototype.
- **Profile** opens a plainly labelled overview of the planned five sections. No editable multi-user profile or database writes have been invented.
- **Statistics** explains the current preview counters and links to the existing full Jobs dashboard, where current metrics are available.
- **Targets and Reminders** are intentionally browser-tab-only controls. They do not create scheduled alerts or save to Google Sheets.
- Mobile UI layout is explicitly responsive, with safe-area awareness and reduced-motion support.

## Testing and how to open

1. In a local checkout of this branch with Node 20+, run \`npm ci\`.
2. Run \`node --test standalone/mobile_home_shell.test.js\`.
3. Start the existing application using \`npm start\`.
4. Open **\`http://localhost:8080/prototype\`**. \`http://localhost:8080/\` continues showing the baseline Jobs UI.
5. Visit \`/social\` for the original social interface. All actual API-backed features require the existing auth and correctly configured staging credentials.

**Do not run paid Make CV generation as a smoke test.** Do not connect the prototype to production Sheets with write permissions to validate the UI. The server's default \`APP_READ_ONLY\` gate remains intact. Full live functionality still needs a properly authorised read-only staging backend, and current Cloud Run deployment provenance has not been independently verified.

### Tests performed in this chat

- [x] Verified both feature HTML blobs match the baseline Git SHAs.
- [x] Server and launcher JS compile; synthetic \`GET /prototype\` builds a full-size HTML page with intact original navigation, bridge and extra scripts.
- [x] Simulated launcher actions: all four home buttons, Network route, Job dashboard entry, back navigation, Targets and Reminders.
- [ ] Run repository Node tests in a checked-out runtime with dependencies.
- [ ] Visual QA on actual Android/iPhone widths and tablet.
- [ ] Independently verify active production revision before staging and never deploy without permission.

## Explicit next stages — only on user request

**Stage 2: compact hub navigation, no feature logic changes.** Restyle the Jobs and Social chrome and map the five requested nav buttons to the current original screens. Jobs: Dashboard | Discovery | Swipe | Make CV | More; Social: Targets | Research | Swipe | Follow-ups | Stats. Existing filters, uploads, queue, invitations and documents continue calling their current handlers. The new Jobs Swipe view will initially be read-only until Stage 3; do not silently connect it to CV generation or write statuses.

**Stage 3: new Jobs Swipe data flow, safely gated.** Gate on Discovery-cleared rows with complete JD, then allow right = interested, left = not interested using a new user-owned preference store after permission scoping. Summary + expandable complete JD. Nothing should trigger costly Make CV without an explicit action.

**Stage 4: UID-secured profile and real reporting.** Authenticated user-owned profile, achievements, reminders, rankings and statistics, with backend-enforced ownership; replace legacy candidate controls only after migration and account-isolation testing.

No automatic progression, no production deployment, no Cloud Run or Firebase rollout.
