# Garamaal 3D Entrance — three-role quality review
Date: 2026-10-28
Branch: feat/garamaal-scroll-3d-entrance
Review artifact: standalone/entrance-3d/review-v2.html

## 1. UI/UX Designer review
Reference: 9.33-second square motion-design clip. Three identified moments: a ball leaves a ramp, drops into staggered raised cylindrical pegs, then enters a copper spiral. Text should remain interactive and clear of visual objects.

Original branch issues:
- Blank primary artwork on WebGL-restricted browsers, observed in Chromium QA.
- Camera/frame synchronization flaw: the easing asymptotically approached whole-number chapter boundaries, leaving the previous composition visible.
- Oversized 02 overlapped the peg field; premature spiral/peg transition overlapped the Guide heading.
- Chapter text persisted through camera transitions and could cross moving artwork.
- Desktop-only geometry left inadequate mobile framing.
- Existing prototype had no end-to-end GPU-enabled visual signoff.

Review-v2 design corrections:
- Separate right text / left artwork for Trigger and Guide; left text / right artwork for Engage.
- Opaque, clickable DOM typography and workspaces; animation remains pointer-events:none.
- Scene-specific mobile crops; no decorative number over the peg field.
- Text fades during movement transitions so one editorial headline does not obscure the moving ball.
- Actual 3D rendered geometry and lighting, delivered as browser-cached WebP frame atlases (no video file).
- Light Royal Porcelain and dark Royal Espresso colours as specified.

## 2. Developer and QA review
Implementation is scroll-scrubbed sequence of actual offline-rendered 3D geometry, not live browser WebGL or live Rapier physics. Frame atlases hold 48 3D renders per scene, per theme. Scroll interpolation uses requestAnimationFrame and exponential smoothing with a chapter-boundary snap tolerance. DOM links are independent of the artwork.
- Automated Chromium checks: 1440x900, 390x844, 320x680, 768x1024.
- Result: no JavaScript page exceptions; zero horizontal overflow in all four viewports.
- Result: light/dark switch, accessible chapter links, chapter detail page, destination menu and 4 end-of-journey links work in local test.
- Result: standalone source includes 24 image assets; no outside dependencies; core links remain external existing Garamaal routes.
- Result: previously WebGL-only blank state replaced with a visible and scrollable renderer.
- Not yet verified: performance and memory on physical low-end Android/iPhone; practical user feeling of animation fluidity on trackpads/touch; destination behavior against live authenticated app; browser compatibility matrix.
- Not pixel-for-pixel identical to source video; shadows are baked VTK decals and the 3D scene is rasterized at build time.

## 3. Proposition Manager + Lead Web Developer release gate
Decision: NO PRODUCTION DEPLOYMENT.
Reasons: reference-animation fidelity still needs explicit visual acceptance, 48-frame transitions need end-user smoothness validation on representative hardware, live destination deep links need authenticated integration testing, and no canary deployment has been tested.
- Safe Git review: YES. New self-contained review-v2.html exists only on feature branch.
- Static preview / local HTML: YES, for review purposes.
- Merge to main: NO.
- Redirect live /prototype or update Firebase hosting: NO.
- Do not modify the current CV, Jobs, Social, Sheets, auth or workflow backend.

## Mandatory acceptance criteria before signoff
1. Reference side-by-side: ball starts on ramp, physically-looking deflections across pegs, then enters spiral; no teleport at scene boundary.
2. Text/safety zones: zero overlap at every major scroll offset on 1440, 1280, 768, 390 and 320 widths in both themes.
3. Smoothness: physical-device testing, no missing assets or unacceptable frame jank under normal scroll/flick.
4. Full navigation: all 3 chapter links, 4 workspace entrances, menu and theme controls verified in authentic environments.
5. Performance/accessibility: reduced-motion setting, keyboard access, resource memory and contrast checks.
6. Deployment: zero-traffic canary on isolated route, owner signoff, then staged traffic promotion with rollback.

This is an evidence-based visual prototype, not certified production-ready software.