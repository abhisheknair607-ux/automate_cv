# Garamaal — Mobile Visual QA & Safe Artwork Framing

**Branch:** `prototype/mobile-v3-motion-qa-20261025`  
**Checkpoint:** 25 October 2026  
**Production:** No merge, no Firebase or Cloud Run deploy, no data writes, no AI cost.

## Result and new artwork boundary fix

The first four-card home screen had two compounding clipping problems:

- The original art sprite touched the 145px-wide source tile edges, so the building/photo/collage content was cut even when a card displayed its entire CSS layer.
- The previous CSS enlarged the layer to 62% width and 121% height, offset beyond the rounded card; scale/rotation motion compounded clipping, particularly on narrow phones.

**Resolution:**

- Generated a replacement 580 × 160 RGBA WebP sprite with per-panel internal safe margins (~5–8% of each tile) and soft, irregular cut-paper opacity edges. All four subject areas remain visible inside the source artwork.
- Separately saved the revised source art in Drive: [safe-organic home sprite](https://drive.google.com/file/d/1EHsFIlWZ7WXvUWVc0dIA6-cHmz_Ju3jU/view).
- Updated `standalone/assets/home-art.css` to embed this image so the QA branch does not require any external image host.
- Adjusted the artwork layer to ~53% of each card instead of 62%, constrained hover motion to 1.5% scale rather than >4%, and added a mild horizontal alpha fade.
- On screens 375px or narrower, limited text to 49% width and 20px headings. Longer text wraps rather than crossing onto the portrait.
- Kept the existing Home tile click actions, drawer, Swipe arrows, original Jobs/Social navigation and all page feature handlers.

## Exact scope of change

- `standalone/assets/home-art.css` — new embedded RGBA/WebP art (89,706 source bytes).
- `standalone/mobile_stage_visual_qa.css` — phone width/height, keyboard, safe-area and updated image containment rules.
- `standalone/server.js` — prototype-only CSS route injection.
- `standalone/social_server.js`, `Dockerfile.social` — include the optional Social visual QA CSS; normal Social remains untouched.
- `standalone/mobile_approved_asset_layer.test.js` — updated image size regression expectation and phone typography guardrails.
- `standalone/mobile_fullapp_route_staging.test.js` — new dependency-only, no-credentials loopback smoke check of actual Jobs and Social Express routes. It requires `npm ci` and **has not been executed against a checked-out runtime in this conversation**.
- `prototypes/mobile-v3/mobile-visual-QA-safe-cutouts.html` — corrected offline QA file, mobile interactive, fictional records.

## QA outcomes

| Check | Outcome | Evidence level |
|---|---|---|
| Unmodified `webapp/Index.html` original Git blob `765acba0...` | PASS | GitHub source readback |
| Unmodified `standalone/social.html` original Git blob `99b0fd9...` | PASS | GitHub source readback |
| Both Express route scripts and smoke test JS parse | PASS | Syntax compilation checks |
| `/prototype` and opt-in `/social?gmv3=1` have correct route/CSS wiring | PASS | GitHub source review; earlier synthetic route tests |
| Safe-organic artwork image and narrow-phone CSS committed | PASS | GitHub source readback |
| 320, 375, 390, 430, 768, 1024px: home, Jobs and Social nav, Research, Drawer, Swipe arrows | PASS | Chromium isolated **offline visual fixture**, not authenticated app |
| No horizontal overflow or page JS exceptions | PASS | Same Chromium fixture |
| Drawer closes with Escape | PASS | Same Chromium fixture |
| CSS reduced-motion disables art transition | PASS | Browser computed style |
| Real Jobs/Social Express route test under installed Node dependencies | NOT EXECUTED | Runnable test committed |
| Real Firebase-logged-in Cloud Run staging and full browser screenshot | NOT EXECUTED | No isolated staging deployment/credentials available; production untouched |
| Paid CV generation, status writes, email, LinkedIn posts | NOT RUN | Intentionally excluded |

Screenshot captures and a JSON test matrix are included in the downloadable ZIP supplied with the ChatGPT QA checkpoint. The [standalone interactive QA HTML](./mobile-visual-QA-safe-cutouts.html) is preserved in this branch. The static offline QA covers representative flows with fictional data; screenshots must **not** be presented as authenticated production/staging screenshots.

## Proposed local / CI verification

From the branch checkout, with Node 20+:

```bash
npm ci
APP_READ_ONLY=true NODE_ENV=test node --test \
  standalone/mobile_home_shell.test.js \
  standalone/mobile_hubs.test.js \
  standalone/mobile_approved_asset_layer.test.js \
  standalone/mobile_editorial_polish.test.js \
  standalone/mobile_fullapp_route_staging.test.js
```

This opens only ephemeral `127.0.0.1` Express ports, fetches source HTML/CSS/scripts, and closes both servers. It makes **no Sheets, Drive or paid OpenAI calls**.

## Design / next approval gate

Next stage: **separate staging environment with read-only API credentials** and real rendered screenshots at key widths, followed by targeted CSS fixes, while continuing to preserve original Jobs and Social HTML and backend behavior. Do not merge/deploy the motion branch to production. Jobs Swipe remains intentionally read-only until the separate data-contract and authorization approval.
