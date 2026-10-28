# Garamaal 3D Entrance — isolated proof-of-concept

Branch: `feat/garamaal-scroll-3d-entrance`

This directory is intentionally isolated from the existing Jobs, Social and CV backend. The new WebGL2 entrance is **not mounted into `/prototype` or deployed to Firebase/Cloud Run**. It is a standalone static website, not a video file.

## Preview

Serve `index.html` from any static HTTP server (for example `python3 -m http.server 8080` from this directory), then open `http://localhost:8080`. A local file URL also works in browsers that allow file navigation. Use a recent WebGL2-enabled desktop or mobile browser.

## Behaviour

- 01 Trigger — copper ball rolls along a real 3D tube/ramp and drops.
- 02 Engage — 25 raised cylindrical 3D pegs; precomputed deterministic gravity/collision trajectory (same ball bouncing as you scroll).
- 03 Guide — real 3D continuous spiral mesh; ball travels down the tube.
- Scrolling controls the ball's position and blends between chapters; no embedded MP4 or video scrubbing.
- The words Trigger, Engage and Guide (and their CTAs) navigate to real `?view=trigger`, `?view=engage` and `?view=guide` pages with back navigation.
- Menu and finishing cards link to the **existing live Garamaal** Jobs/Network experiences, opening separately; profile, Jobs and statistics currently share the existing `/prototype` entry because this isolated static page does not have access to the authenticated workspace's internal state.
- Royal Porcelain / Royal Espresso exact CSS theme colours; theme persists in localStorage when available.
- Responsive typography/visual separation: on desktop, copy stays in the left 42% and the 3D world in the right 58%; mobile reserves the top 52svh for 3D and the lower portion for copy.
- Accessible links and keyboard focus; WebGL unavailable gracefully leaves the navigation functional.

## Rendering/quality limitations

3D shapes are true GPU-rendered WebGL geometry with per-fragment lighting and material highlights. Collision paths are generated deterministically with small-step impulse physics, then sampled by the scroll timeline. The 3D objects use soft projected contact shadows, not full ray-traced shadow maps. Exact frame-for-frame recreation of the uploaded source would require additional camera/material calibration and browser screenshot QA. WebGL browser QA could not complete in the current restricted local browser; JavaScript syntax and structural route checks passed.

## Integration boundary

Do not deploy this prototype or change default `/` or `/prototype` routing without a separate explicit rollout decision. To test it under a Cloud Run canary later, add a guarded isolated route in `standalone/server.js` and verify on the zero-traffic tagged revision before any promotion. Nothing here touches `fitness-tracker`.