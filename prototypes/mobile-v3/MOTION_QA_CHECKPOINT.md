# Garamaal Mobile V3 — Motion & Sidebar QA Checkpoint

**Status:** Visual/motion QA prepared; no merge or deployment.  
**Branch:** \`prototype/mobile-v3-motion-qa-20261025\`  
**Based on:** \`prototype/mobile-v3-feature-parity-20261025\`  
**Date:** 25 October 2026

## 1 — Art direction

**Approved for testing, not a final design approval:** grown-up 2D cut-paper / magazine-zine collage; high-contrast ink strokes, black-and-white portrait/building and handshake illustrations, loud acid lime / orchid / pink accents, handwritten details and sharp type.

- No shiny 3D clipart, emoji illustration packs or purchased stock assets.
- Original self-hosted four-panel SVG sprite: \`standalone/mobile_motion_artwork.svg\`; no remote fonts, image hotlinks, licence surprise or persistent Internet connection needed.
- The offline QA download supplied in chat uses independently generated photo-cutout assets to test the *same editorial direction*. That downloadable file is **not** a feature-complete production build, whereas the branch's real \`/prototype\` route still uses full Jobs.
- Card imagery is decoration; labels remain plain HTML text for accessibility.

## 2 — Motion map

\`\`\`text
        HOME CARD                            HUB TAB
  ┌─────────────────────────┐           ┌──────────────────┐
  │ Background cut-out art  │           │  Dashboard       │
  │                         │ hover     │  Discovery       │
  │ Hover: rise & -1°       │ ------>   │  Swipe      ↻    │
  │ Accent: gloss sweep     │           │  Make CV         │
  │ Image: gentle tilt      │           │  More            │
  │ Tap: compress & rotate  │           └──────────────────┘
  └─────────────────────────┘             Hover: quick tilt
                 │                        Active: stamp / twist
                 ▼                        Tap: tactile scale
        [ Existing onClick ]                      │
                 │                                ▼
        [ Real Jobs / Social ]             [ Original handlers ]
\`\`\`

Motion properties:
- Card: lift on hover, small asymmetrical twist, fast press state, cut-out illustration movement and gloss.
- Jobs/Social footer: subtle hover lift, icon twist, distinct centred Swipe marker, brief active bounce.
- All animation is visual CSS; **no new navigation interceptors, CV calls or preference writes**.
- Phone touch surfaces get a press state even without hover.
- \`@media (prefers-reduced-motion: reduce)\` eliminates animations and transforms.
- The interactive elements keep keyboard-focus outlines and labels.

## 3 — Profile avatar → right-side drawer

\`\`\`text
              Tap avatar from Home, Jobs or Social
                              │
                              ▼
  ┌────────────────────────────────────────────────┐
  │                 RIGHT ACCOUNT DRAWER           │
  │  Garamaal                             [ × ]    │
  │  [ User initial ]  Current workspace           │
  │                                                │
  │  Total recorded CV cost                        │
  │  [ Existing recorded USD estimate / unknown ]  │
  │  Partial cost disclaimer                       │
  │                                                │
  │  Profile                                       │
  │  Statistics                                    │
  │  Reminders & targets                           │
  │  Usage & credits                               │
  │  Home                                          │
  │                                                │
  │           Made with care, for you. ♡           │
  └────────────────────────────────────────────────┘
\`\`\`

- Uses the existing candidate view label as a placeholder only; it is **not true multi-user authorization**.
- Jobs: costs are requested on **drawer open** through the existing authenticated \`getExpenses\` endpoint and shown in USD **only when the recorded value is a valid number**. Labelled "Recorded estimates only, not a complete bill". Failed/unavailable data prints **Not available**, never a made-up € amount.
- Social: because it is a separate Cloud Run service, no cross-service expense API call is attempted. Drawer clearly says **View in Jobs**.
- Drawer includes click-away, close button, Escape, Tab focus cycling, return focus, reduced-motion support and meaningful landmarks/labels.
- My Profile links to the prior existing prototype's planned profile overview. This is **not** a newly implemented Firestore editor, and the drawer should not imply otherwise.

## 4 — Source changes isolated to QA branch

| Item | Behaviour |
|---|---|
| \`standalone/mobile_motion_artwork.svg\` | Four locally hosted, original 2D editorial illustrations |
| \`standalone/mobile_motion_qa.css\` | Art placement, card hover/touch and tab twist, drawer transitions, reduced-motion rules |
| \`standalone/mobile_motion_drawer.js\` | Right drawer, verified expense read, navigation and accessibility |
| \`standalone/mobile_home_landing.html\` | Four existing actions display new artwork; avatar becomes drawer trigger |
| \`standalone/server.js\` | Add three \`/prototype/motion-*\` asset routes; inject only into \`/prototype\` |
| \`standalone/social_server.js\` | Add CSS/JS ONLY to \`/social?gmv3=1\`; normal Social remains unchanged |
| \`Dockerfile.social\` | Package new Social opt-in styling and drawer JS; no Jobs source added |
| \`standalone/mobile_motion_qa.test.js\` | New regression guardrails |

**Unchanged and preserved:** \`webapp/Index.html\`, \`standalone/social.html\`, CV worker, Google Drive and Freshmaal logic, live / Jobs route, unflagged /social, paid APIs, source data, current candidates.

## 5 — Checks performed

- [x] JavaScript syntax: Jobs server, Social server, drawer script.
- [x] Route simulation: \`/prototype\` still assembles full Jobs HTML plus style/script links, and opt-in Social still assembles the full Social frontend.
- [x] Git SHA comparison of both existing HTML feature files.
- [x] Offline QA page opened via Chromium at **320, 375, 390, 430, 768px**.
- [x] Offline QA page: 4 home buttons, avatar drawer open/close, Escape, 5 Jobs bottom buttons, no horizontal overflow or page JS errors.
- [x] Offline QA HTML, screenshots and instructions packaged in chat.
- [ ] Execute new Node test suite in a real checked-out repository with its dependencies.
- [ ] Test the **actual connected branch** in a deployed isolated staging environment with real Firebase login and read-only credentials.
- [ ] Test iOS Safari physical device, TalkBack/VoiceOver, 60fps profiling on older Android.
- [ ] Approve illustration treatment, nav timing and drawer copy after visual review.

## Next checkpoint

Do **not** merge or deploy from this branch without explicit approval. After the user approves the motion QA, next stage should reconcile image sizing/placement and interaction timing in real mobile browsers, then prepare a separate **staging-only** visual QA without touching the production Cloud Run revision. Real job-swipe writes, multi-user UID authorization and payments remain out of scope.
