# Electric serpentine: review v2

**Preview:** open `serpentine-v2.html`. This is a self-contained HTML file with embedded physical 3D PCB render artwork and photo fallbacks.

## User design requirements represented
- Hero: headline, copy and buttons centred in upper part; physically rendered copper microchip/PCB in the **lower half**. Animated short copper pulses flow towards chip.
- Current originates from the microchip only as the page scrolls, then follows **one continuous SVG route**, crossing each inset photograph before travelling to the opposite-side image below.
- Sections alternate: Discover Jobs text left/photo right; Apply photo left/text right; Network text left/photo right; Statistics photo left/text right.
- Images stay smaller than their half-column so incoming/outgoing wire is visibly exposed. Each image and primary CTA is illuminated as the current reaches it.
- Exact Royal Espresso and Royal Porcelain tokens; theme switch; reduced-motion support; real clickable anchors to Garamaal prototype and Social.

## Photo assets
Full-size online images are from Pexels:
- George Milton, photo 7034389: Discover
- Markus Winkler, photo 4101343: Apply
- Mikhail Nilov, photo 9301295: Network
- Antoni Shkraba, photo 5466250: Statistics

Offline fallbacks cropped from the user's Garamaal screenshot. Background PCB rendered locally from custom 3D geometry with VTK. Review licensing and optimize assets before any public release.

## Quality gate
Local Chromium `set_content` checks at 320, 390, 768 and 1440px: no JS exceptions, no horizontal overflow, correct active current through photos, theme switch and active CTA glow. This has **not** been deployed to production. Main branch and existing Jobs/Social backend unchanged. Requires stakeholder visual review and mobile performance testing before deployment.