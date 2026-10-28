"""Royal Espresso navigation must remain a presentation-only override."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
THEME = (ROOT / "standalone" / "garamaal_theme.css").read_text(encoding="utf-8")
NAV = (ROOT / "standalone" / "mobile_jobs_hub.js").read_text(encoding="utf-8")
HOME = (ROOT / "standalone" / "mobile_home_shell.js").read_text(encoding="utf-8")
SERVER = (ROOT / "standalone" / "server.js").read_text(encoding="utf-8")


def test_exact_shared_royal_espresso_and_porcelain_palette():
    for colour in ("#A76543", "#30231E", "#211A16", "#D2AD95",
                   "#E2B08B", "#965638", "#EDE2D5", "#FFFDF9"):
        assert colour in THEME
    for colour in ("#5B4032", "#FFFFFF", "#E7D3C4", "#49342A",
                   "#362720", "#DCC8B8", "#654536", "#F0DED2"):
        assert colour in THEME
    assert ':root[data-garamaal-theme="dark"]' in THEME
    assert ':root[data-garamaal-theme="light"]' in THEME
    assert '/prototype/career-theme.css?v=9' in SERVER


def test_original_five_tabs_and_back_behavior_untouched():
    for ident, label in (("dashboard", "Dashboard"), ("discovery", "Discovery"),
                         ("swipe", "Swipe"), ("fresh", "Make CV"), ("more", "More")):
        assert f'["{ident}","{label}"' in NAV
        assert f'data-g3-jobs="{chr(39)}+id+' in NAV
        assert f'button[data-g3-jobs="{ident}"]' in THEME
    assert "bar.addEventListener(\"click\"" in NAV
    assert "window.GaramaalJobsHub=Object.freeze({selectPage,openSwipe,closeMore:hideOverlay})" in NAV
    assert 'homeButton.addEventListener("click",showHome)' in HOME
    assert 'body.gmv3-jobs-workspace #gmv3-home-button' in THEME


def test_sprites_replaced_with_svg_style_mis_without_removing_controls():
    assert "background-image:none!important" in THEME
    assert "-webkit-mask-image:var(--royal-glyph)!important" in THEME
    assert "-webkit-mask-image:var(--royal-back-glyph)!important" in THEME
    assert "content:attr(aria-label)!important" in THEME
    assert 'body.gmv3-landing nav#gmv3-jobs-tabbar.gmv3-tabbar' in THEME
    assert "min-height:82px!important" in THEME
    assert "env(safe-area-inset-bottom)" in THEME


def test_premium_effects_are_ui_only_and_accessible():
    assert "translateY(-4px) scale(1.035)" in THEME
    assert "translateY(1px) scale(.965)" in THEME
    assert "@keyframes gmRoyalNavSheen" in THEME
    assert "@keyframes gmRoyalNavGlint" in THEME
    assert "@media(prefers-reduced-motion:reduce)" in THEME
    assert ":focus-visible" in THEME
    assert '#gmv3-jobs-tabbar button[aria-current="page"]' in THEME
    assert "body.gmv3-jobs-workspace .shell{padding-bottom:calc(119px" in THEME
