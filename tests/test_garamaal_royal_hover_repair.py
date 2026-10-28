"""Targeted UI regression contract for the Royal Espresso post-release repair."""
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
STANDALONE=ROOT/"standalone"
REPAIR=(STANDALONE/"garamaal_royal_repair.css").read_text(encoding="utf-8")
PAGES=(STANDALONE/"garamaal_royal_pages.css").read_text(encoding="utf-8")
THEME=(STANDALONE/"garamaal_theme.css").read_text(encoding="utf-8")
SERVER=(STANDALONE/"server.js").read_text(encoding="utf-8")
NAV=(STANDALONE/"mobile_jobs_hub.js").read_text(encoding="utf-8")
DRAWER=(STANDALONE/"mobile_profile_drawer.js").read_text(encoding="utf-8")
SHELL=(STANDALONE/"mobile_home_shell.js").read_text(encoding="utf-8")


def test_repair_loads_last_without_replacing_original_jobs_code():
    assert 'app.get("/prototype/royal-repair.css"' in SERVER
    assert SERVER.index('/prototype/career-theme.css?v=9') < SERVER.index(
        '/prototype/royal-pages.css?v=stage2-review-1') < SERVER.index(
        '/prototype/royal-repair.css?v=1')
    assert 'sendFile(path.join(__dirname,"garamaal_royal_repair.css"))' in SERVER
    assert "garamaal_royal_repair.css" not in DRAWER
    assert "window.GaramaalJobsHub=Object.freeze({selectPage,openSwipe,closeMore:hideOverlay})" in NAV
    assert 'homeButton.addEventListener("click",showHome)' in SHELL


def test_all_five_original_buttons_have_reliable_alpha_mask_glyphs():
    for id_, label in (("dashboard","Dashboard"),("discovery","Discovery"),
                       ("swipe","Swipe"),("fresh","Make CV"),("more","More")):
        assert f'["{id_}","{label}"' in NAV
        assert f'button[data-g3-jobs="{id_}"]' in THEME
    assert '--royal-glyph' in THEME
    assert '-webkit-mask:var(--royal-glyph) center/contain no-repeat!important' in REPAIR
    assert 'mask:var(--royal-glyph) center/contain no-repeat!important' in REPAIR
    assert '-webkit-mask-mode:alpha!important' in REPAIR
    assert 'color:var(--royal-icon)!important;opacity:1!important' in REPAIR
    assert 'content:attr(aria-label)!important' in REPAIR


def test_every_button_uses_dashboards_copper_hover_and_silver_sheen():
    hover=REPAIR.split('@media(hover:hover) and (pointer:fine){',1)[1].split('}',1)[0]
    assert 'button[data-g3-jobs]:not(:disabled):hover' in hover
    assert 'background:var(--royal-active-hover)!important;color:#FFFFFF!important' in hover
    assert 'border-color:var(--royal-active-hover)!important' in hover
    assert 'animation:gmRoyalNavSheen .65s ease-out 1!important' in REPAIR
    assert 'background:linear-gradient(105deg,transparent 14%' in REPAIR
    assert 'overflow:hidden!important' in REPAIR
    assert 'body.gmv3-workspace.gmv3-jobs-workspace #gmv3-jobs-tabbar.gmv3-tabbar button[data-g3-jobs]' in REPAIR


def test_drawer_fully_opaque_in_both_themes_without_handler_changes():
    assert '#gmv3-account-veil .gmv3-account-drawer{' in REPAIR
    assert 'background:var(--gm-surface)!important;background-image:none!important' in REPAIR
    assert 'opacity:1!important;isolation:isolate!important' in REPAIR
    assert '.gmv3-account-install,.gmv3-account-switch,.gm9-appearance' in REPAIR
    assert "window.GaramaalDrawer=Object.freeze({open,close})" in DRAWER
    assert 'window.GaramaalTheme?.set(themeButton.dataset.gmTheme)' in DRAWER


def test_dark_surface_is_distinct_and_neon_hover_removed():
    for value in ("--gm-bg:#211A16","--gm-surface:#372920",
                  "--gm-surface-raised:#443128","--gm-surface-hover:#503A2E",
                  "--gm-border:#765747"):
        assert value in REPAIR
    assert 'body.gmv3-workspace.gmv3-jobs-workspace #content .jobs > .job:is(:hover,:focus-within,.gmv3-tactile-held)' in REPAIR
    assert 'box-shadow:var(--gm-shadow-hover)!important;filter:none!important' in REPAIR
    assert 'background:var(--gm-surface-raised)!important;border-color:var(--gm-brand)!important' in REPAIR
    assert "dfff58" not in REPAIR.lower()
    assert "d493ef" not in REPAIR.lower()
    assert "ff4caa" not in REPAIR.lower()


def test_original_stage2_stays_visual_colour_only():
    assert "Royal Espresso repair" not in PAGES
    assert "--gm-success-bg" in PAGES and "--gm-danger-bg" in PAGES
    assert "nav#gmv3-jobs-tabbar" not in PAGES
