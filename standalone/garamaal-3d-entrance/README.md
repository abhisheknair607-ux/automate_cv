# Garamaal: scroll-driven 3D entrance

This is a standalone, single-file interactive website for the first three chapters of the Garamaal entrance redesign. **It does not alter the existing dashboard, social app, or production hosting.**

## Run

Open `index.html` in a current WebGL-enabled browser, or serve it as a static site. All CSS and JavaScript are inline, with no external assets or video.

## Features

- One 3D metallic sphere following a vertically continuous path
- Scene 01 (`Trigger`): extruded 3D launch ramp and ball drop
- Scene 02 (`Engage`): staggered cylindrical pegs and deterministic 240 Hz 2D rigid-circle collision simulation projected into the 3D world
- Scene 03 (`Guide`): a real swept-mesh helix and moving ball
- Scroll-tied WebGL camera using requestAnimationFrame interpolation, avoiding choppy MP4 seeking
- Clickable chapter titles and four separate route pages (`?page=profile`, `?page=jobs`, `?page=network`, `?page=statistics`) with a link to the existing Garamaal prototype. These are **standalone preview pages**, not backend-integrated tools.
- Royal Porcelain and Royal Espresso colour themes; add `?theme=dark` to preview Espresso directly.

## Development notes

The 3D geometry is native WebGL meshes with perspective projection, vertex normals, Phong-style lighting and simple shadow geometry; no HTML/CSS shapes are used as substitutes for the moving objects. WebGL must be enabled for animation. A message appears if unavailable.

## Review

This is a feature-branch prototype. Merge and deploy only after visual QA and target-route integration.