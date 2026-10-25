# Garamaal — Editorial polish / cutout repair QA

**Branch:** `prototype/mobile-v3-motion-qa-20261025`  
**Status:** committed to prototype branch; no production merge, staging or Cloud Run deployment.  
**Date:** 25 October 2026

## Why this revision was required

The approved four-piece collage sprite was rendered as a distinct rectangular panel inside each rounded home card. The hard asset edges and cream text labels created two incompatible nested shapes; the rest of the home screen also resembled a formal admin dashboard.

## Fix and visual system

- **One card shape, no inner square.** Home artwork bleeds into the parent card and fades through a layered alpha mask on the left, top and bottom edges. Rounded parent corners are the only hard boundary.
- **No separate boxed text label.** Headings and descriptions sit directly on the card colour with a gentle matching-colour readability gradient.
- **Consistent editorial palette.** Acid lime, lilac, off-white and dark ink remain; typography is confident and cropped but functional. Slightly imperfect border radii and offset print shadows give a magazine / underground-zine feel without cartoon icons.
- **Rest of home brought into the system.** Wordmark gets a small underline, the question gets a deliberate italic serif accent, Targets and Reminders are offset sticker-like chips, and the journey action receives a pink underline.
- **Interior feature screens are warmer.** Page paper surfaces, headings, pills, filter cards and action buttons adopt consistent purple / lime highlights. The existing Dashboard, Discovery, Make CV, Add Job, Social Research/Swipe/Follow-ups logic is not changed.
- **Animations retained:** slight hover lift and tap compression on the four cards; the five bottom buttons still pop/twist; Swipe arrows still separate left and right. Touch hover fallback and reduced-motion media query provided.
- **Profile drawer unchanged:** opens from avatar, reads existing recorded CV expenses when available; no fabricated charge amounts.

## Implementation (CSS only plus route inclusion)

```text
/ (unchanged Jobs)            /social (unchanged Social)
      │                                 │
/prototype                    /social?gmv3=1
      │                                 │
base app, preserved source    base app, preserved source
      │                                 │
motion artwork & nav          motion artwork & nav
      └────────────┬────────────────────┘
                   ▼
    mobile_editorial_polish.css (NEW)
         - collage edge fading
         - editorial shell / chips
         - consistent warm content chrome
         - no new backend calls
```

Added:
- `standalone/mobile_editorial_polish.css`
- `standalone/mobile_editorial_polish.test.js`
- `prototypes/mobile-v3/editorial-polish-QA.html` (standalone interactive offline demo with fake data)
- `prototypes/mobile-v3/EDITORIAL_POLISH_QA_CHECKPOINT.md`

Updated additively: `standalone/server.js`, `standalone/social_server.js`, `Dockerfile.social`.

## QA verification

- [x] Offline Chromium at **320 / 375 / 390 / 430 / 768px**: no horizontal overflow or JS errors.
- [x] Alpha-mask/edge-gradient computed by browser; four illustrated home cards visible and clickable.
- [x] Account drawer opens from avatar and closes with Escape.
- [x] Jobs bottom navigation shows five buttons, with Swipe action visually distinct.
- [x] Preserved original Jobs and Social HTML Git blobs checked.
- [x] New CSS scoped to prototype-only routes; original `/` and non-flagged `/social` unchanged.
- [ ] Execute full checked-out Node test suite in a staging build.
- [ ] Test physical Android / Safari edge mask compositing and focus/scroll behavior.
- [ ] Review visual direction against user's feedback before any staging deployment.

### Review artifacts

- [HTML visual QA](./editorial-polish-QA.html) — use GitHub **Raw / Download** rather than the code viewer to open the interactive file.
- Reusable approved artwork is maintained in `standalone/assets/` as independent CSS/data-URI WebP sprites.
- Asset originals: [Garamaal Mobile V3 UI Assets](https://drive.google.com/drive/folders/1YbocBPBpmgzkn8PPvTK-hD2T9Afec6Bs).

**No live application data, production hosting, prompts, models, billing, credentials or paid OpenAI workflow was changed.**
