# Garamaal — Approved UI Assets + Motion Checkpoint

**Branch:** `prototype/mobile-v3-motion-qa-20261025`  
**Status:** Assets and actual app prototype committed; offline mobile QA passed; no production merge/deploy.  
**Date:** 25 October 2026

## What was approved and integrated

The four card illustrations, cut-paper navigation badges, and Back/Profile control kit were cropped from the approved high-contrast 2D collage artwork, rather than reconstructed from CSS shapes or the earlier placeholder SVG.

### Asset structure

| Asset | Location in branch | Raster resolution | Purpose |
|---|---|---|---|
| Home illustration sprite | `standalone/assets/home-art.css` | 580×160 WebP | Four different card illustrations, CSS background-position |
| Navigation state sprite | `standalone/assets/navigation-states.css` | 500×285 WebP | Five tab icons across normal, hover and active rows |
| Header control sprite | `standalone/assets/header-controls.css` | 700×105 WebP | Back, account and close artwork references |
| Interaction CSS | `standalone/mobile_approved_asset_layer.css` | CSS | Pop-up/twist, split Swipe arrows, image mapping, phone/reduced-motion styling |
| QA page | `prototypes/mobile-v3/approved-button-motion-QA.html` | Self-contained HTML | Offline phone preview with fictional data and real sprite artwork |

The three sprites are independent **self-contained CSS asset files**, each embedding exactly one WebP bitmap as a local `data:` source. This permits GitHub's UTF-8 file interface and avoids relying on hotlinks. The high-resolution original source WebP files are separately stored in the private Drive folder:

[Garamaal Mobile V3 UI Assets](https://drive.google.com/drive/folders/1YbocBPBpmgzkn8PPvTK-hD2T9Afec6Bs)

## Behavior in the feature-preserving app

```text
                    HOME /prototype
               ┌────────────────────┐
               │ Four collage cards │
               └──────────┬─────────┘
                          │ original onClick handlers
            ┌─────────────┴──────────────┐
            ▼                            ▼
      Original Jobs              Original Social
      Dashboard / ...            Targets / ...
      5-tab art icons            5-tab art icons
      middle Swipe               middle Swipe
     [ ←       → ]              [ ←       → ]
      separately animated on hover, no extra data writes
            │                            │
            └───────────┬────────────────┘
                        ▼
               compact illustrated Back
```

- All four home cards keep their existing destinations.
- Every footer button keeps its current handler, including legacy Dashboard, Discovery, Make CV and all Social workflows.
- The middle Swipe arrows translate apart on hover; the other buttons lift/bounce into hover and active assets.
- Back includes default/hover/pressed states, with an unchanged navigation action.
- All animations respect `prefers-reduced-motion: reduce`; the UI is accessible to keyboard users.
- Account drawer retains the separate recorded-CV-cost read with unavailable-state fallback, not a fabricated spend amount.

## Quality gates

- [x] High-resolution asset images uploaded separately to Drive.
- [x] Images committed to the QA branch as self-contained GitHub CSS assets.
- [x] New CSS and assets loaded only by the opt-in `/prototype` and `/social?gmv3=1` routes.
- [x] Social Docker image updated to include the opt-in CSS assets.
- [x] Original Jobs `webapp/Index.html` SHA unchanged: `765acba0e663e291545f3ceb3083178a92431646`.
- [x] Original Social `standalone/social.html` SHA unchanged: `99b0fd9046c52ac2701e54ca3383c9597340c0ee`.
- [x] Three asset payload sizes verified: 19,432 / 44,190 / 24,614 image bytes.
- [x] JavaScript syntax checks passed for server, hub clients, account drawer and tests.
- [x] Offline Chromium interactive test passed at 320, 375, 390, 430 and 768 px with no horizontal overflow or JS errors.
- [x] Offline tests verified navigation, Swipe-arrow elements, open account drawer and Escape close.
- [ ] Check the actual staged feature-preserving app in connected Jobs + Social environments; the offline QA page has deliberately fictional data and does not demonstrate API operation.
- [ ] Test physical iOS/Android browsers for animation performance, sticky bottom bar and safe areas.
- [ ] Visual sign-off before making a staging or production release.

**No live website, Cloud Run service, Firebase deployment, main branch, Sheets, Drive automation or paid CV API was modified by this GitHub push.**

## How to review

1. On GitHub, open [the QA HTML in the branch](./approved-button-motion-QA.html) and use Download Raw to open it locally; GitHub's code viewer does not execute the interactive HTML.
2. Or use the downloadable single-file QA attached in the ChatGPT response.
3. From a local branch checkout, the complete app would expose `/prototype` and the opt-in `/social?gmv3=1` routes when running the appropriate Jobs and Social services. No branch deployment has been performed.

## Next gated step

After approval, run a **staging-only visual QA** against the real feature-preserving app (no edits to original feature code), fix device-specific spacing/touch issues, and capture before/after screenshots. Do not enable job Swipe writes or CV generation from the new UI without separate approval.
