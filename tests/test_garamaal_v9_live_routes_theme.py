"""UI-only contracts for integrated V9 Career Trail and native Jobs pages."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STANDALONE = ROOT / "standalone"
HOME = (STANDALONE / "garamaal_career_trail_v9.html").read_text(encoding="utf-8")
BRIDGE = (STANDALONE / "garamaal_theme_bridge.js").read_text(encoding="utf-8")
THEME = (STANDALONE / "garamaal_theme.css").read_text(encoding="utf-8")
NAV = (STANDALONE / "mobile_jobs_hub.js").read_text(encoding="utf-8")


def test_picture_cards_dispatch_real_app_routes_without_dropping_visual_fallback():
    assert "location.pathname==='/prototype/career-trail'" in HOME
    assert "parent.postMessage({type:'garamaal-career-action',action:destination}" in HOME
    assert "gm8-portal active entering gm9-routing" in HOME
    assert ".gm8-portal.gm9-routing .gm8-page{display:none!important}" in HOME
    assert "const data=content[a.rect.name]" in HOME
    assert "event.stopImmediatePropagation()" in HOME
    for action in ("profile", "jobs", "network", "stats"):
        assert f"{action}:{{title:" in HOME
        assert f'case "{action}":' in BRIDGE


def test_artwork_is_edge_faded_not_removed():
    assert HOME.count('<img class="art"') == 4
    assert 'id="gm9-seamless-artwork"' in HOME
    assert ".story .visual img.art{" in HOME
    assert "mask-image:radial-gradient" in HOME


def test_five_existing_jobs_tabs_and_both_themes_are_preserved():
    for id_, label in (("dashboard", "Dashboard"), ("discovery", "Discovery"),
                       ("swipe", "Swipe"), ("fresh", "Make CV"), ("more", "More")):
        assert f'["{id_}","{label}"' in NAV
    assert "window.GaramaalJobsHub=Object.freeze({selectPage,openSwipe,closeMore:hideOverlay})" in NAV
    assert 'data-garamaal-theme="light"' in THEME
    assert 'data-garamaal-theme="dark"' in THEME
    assert '.gmv3-tabbar button::after' in THEME
    assert 'content:attr(aria-label)' in THEME
    assert "body.gmv3-landing .gmv3-tabbar{display:none!important}" in THEME
    assert "--gm9-ink" in THEME
