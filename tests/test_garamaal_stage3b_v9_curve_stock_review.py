"""Stage 3B: never replace Garamaal's original V9 rolling sphere or guideway."""
from pathlib import Path
import re

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/"standalone"
ORIGINAL=(BASE/"garamaal_career_trail_v9.html").read_text(encoding="utf-8")
REVIEW=(BASE/"garamaal_career_trail_curve_review.html").read_text(encoding="utf-8")
CSS=(BASE/"garamaal_curve_overlay_review.css").read_text(encoding="utf-8")
JS=(BASE/"garamaal_curve_overlay_review.js").read_text(encoding="utf-8")
ART=(BASE/"garamaal_curve_art_review.js").read_text(encoding="utf-8")
SERVER=(BASE/"server.js").read_text(encoding="utf-8")


def test_v9_path_and_3d_ball_are_byte_identical():
    # Review is a copy of original V9 with ONLY a CSS link, two external
    # scripts, and a different <title>. No original JS or track geometry edited.
    stripped=REVIEW.replace(
        '<link rel="stylesheet" href="/prototype/curve-overlay-review.css?v=3b">',""
    ).replace(
        '<script src="/prototype/curve-art-review.js?v=3b"></script>'
        '<script src="/prototype/curve-overlay-review.js?v=3b"></script>',""
    ).replace(
        "<title>Garamaal Stage 3B — Original V9 Curves & Real Photography · Review</title>",
        "<title>Garamaal — Career Trail V9 — 3D Copper & Touch Interaction</title>"
    )
    assert stripped == ORIGINAL, "V9 route or sphere code changed"
    for marker in ('id="global-track"','id="global-ball"','id="gm9-orb"',
                   'id="global-path"','id="garamaal-v9-sphere"',
                   "window.GaramaalV9Sphere?.draw", 'getPointAtLength'):
        assert marker in REVIEW


def test_separate_real_stock_photos_not_cropped_hotspots():
    urls=re.findall(r'https://images\.unsplash\.com/photo-[^"\s]+',ART)
    assert len(urls)==8 and len(set(urls))==8
    for section in ("overview","jobs","network","stats"):
        assert f'"{section}": "https://images.unsplash.com/' in ART
    for action in ("profile","jobs","network","stats"):
        assert f'"{action}": "https://images.unsplash.com/' in ART
    assert ART.count("https://unsplash.com/photos/")>=8
    assert 'section.prepend(edge)' in JS
    assert 'section.append(panel)' in JS
    assert "button.dataset.entry=action" in JS
    assert 'actions=id===\'overview\'?[' in JS
    assert 'visual.append(panel)' not in JS


def test_gradient_shadow_and_real_sparkles_without_square_hover_outline():
    for marker in ('filter:blur(15px)','radial-gradient(',
                   '.gm11-card::before', '.gm11-spark.first',
                   '.gm11-spark.second', '@keyframes gm11-glint',
                   '@keyframes gm11-twinkle'):
        assert marker in CSS
    assert '0 0 0 2px' not in CSS
    assert 'border-radius:32px' in CSS
    assert 'prefers-reduced-motion' in CSS


def test_new_review_separate_from_existing_live_homepage():
    assert 'app.get("/prototype/career-trail"' in SERVER
    assert 'garamaal_career_trail_v9.html' in SERVER
    assert 'app.get("/prototype/career-curve-review"' in SERVER
    for name in ("garamaal_career_trail_curve_review.html",
                 "garamaal_curve_overlay_review.css",
                 "garamaal_curve_overlay_review.js",
                 "garamaal_curve_art_review.js"):
        assert name in SERVER
    assert 'garamaal_career_trail_v10_review.html' in SERVER


def test_mobile_two_bank_layout_preserves_original_route():
    assert '.story .gm11-card-panel{left:calc(50% + 36px)' in CSS
    assert '#network .gm11-card-panel{left:10px;right:calc(50% + 36px)}' in CSS
    assert '#overview .gm11-card-panel{left:14px;right:calc(50% + 30px)' in CSS
    assert '#global-track' not in CSS and '#global-ball' not in CSS
    assert 'window.GaramaalV9Sphere' not in JS
    assert 'getPointAtLength' not in JS
