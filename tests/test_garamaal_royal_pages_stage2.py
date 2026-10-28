"""Stage 2 Royal Espresso internal pages: visual-only source and colour contracts."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
CSS = (ROOT / "standalone/garamaal_royal_pages.css").read_text(encoding="utf-8")
SERVER = (ROOT / "standalone/server.js").read_text(encoding="utf-8")
NAV = (ROOT / "standalone/mobile_jobs_hub.js").read_text(encoding="utf-8")
BACK = (ROOT / "standalone/mobile_home_shell.js").read_text(encoding="utf-8")


def test_stage2_palette_matches_approved_tokens():
    light = CSS.split(':root[data-garamaal-theme="light"] {', 1)[1].split(
        ':root[data-garamaal-theme="dark"] {', 1)[0]
    dark = CSS.split(':root[data-garamaal-theme="dark"] {', 1)[1].split(
        '/* Semantic aliases', 1)[0]
    both = {"--gm-brand": "#A76543", "--gm-brand-hover": "#965638",
            "--gm-brand-pressed": "#8C492F", "--gm-champagne": "#D2AD95",
            "--gm-sparkle": "#E2B08B"}
    for area in (light, dark):
        for token, value in both.items():
            assert f"{token}:{value};" in area
    for token, value in {"--gm-bg": "#EDE2D5", "--gm-surface": "#FFFDF9",
                         "--gm-text": "#30231E", "--gm-border": "#DCC8B8"}.items():
        assert f"{token}:{value};" in light
    for token, value in {"--gm-bg": "#211A16", "--gm-surface": "#30231E",
                         "--gm-text": "#FFFDF9", "--gm-border": "#5B4032"}.items():
        assert f"{token}:{value};" in dark


def test_css_is_loaded_after_stage1_without_modifying_existing_route():
    assert 'app.get("/prototype/royal-pages.css"' in SERVER
    assert 'garamaal_royal_pages.css' in SERVER
    assert SERVER.index('/prototype/career-theme.css?v=9') < SERVER.index(
        '/prototype/royal-pages.css?v=stage2-review-1')
    assert 'sendFile(path.join(__dirname,"garamaal_royal_pages.css"))' in SERVER
    assert 'window.GaramaalJobsHub=Object.freeze({selectPage,openSwipe,closeMore:hideOverlay})' in NAV
    assert 'homeButton.addEventListener("click",showHome)' in BACK


def test_no_geometry_navigation_or_animation_modifications_to_inner_pages():
    # Reject CSS declarations changing layouts and event hit boxes.
    css_no_comments = re.sub(r"/\*.*?\*/", "", CSS, flags=re.S)
    forbidden = re.compile(
        r"(?<![-\w])(?:display|position|inset|top|bottom|left|right|width|height|"
        r"min-width|max-width|min-height|max-height|padding|margin|"
        r"grid-template-columns|flex|transform|translate|scale|"
        r"z-index|pointer-events|visibility|opacity)\s*:",
        re.I)
    assert not forbidden.search(css_no_comments), "Stage 2 must be visual colours only"
    assert "nav#gmv3-jobs-tabbar" not in css_no_comments
    assert "#gmv3-home-button" not in css_no_comments
    assert "body.gmv3-workspace" in css_no_comments
    assert "body.gmv3-landing" not in css_no_comments


def test_internal_pages_and_interactive_states_are_covered():
    for selector in (".kpi", ".job", ".toolbar", ".tier-banner", ".tier-cell",
                     ".gmv3-drag-card", ".gmv3-cv-settings", ".gmv3-filter-panel",
                     ".gmv3-pf-dialog", ".gmv3-account-drawer", ".drawer",
                     ".modal-back", ".gmv3-choice-sheet", ".gmv3-swipe-toast",
                     ".gm9-appearance", ".gmv3-pf-section", ".gmv3-location-option",
                     ".selectionbar", ".toast.error"):
        assert selector in CSS
    for state in (".job:hover", ".job:focus-within", ".chip.active",
                  '.gmv3-account-switch button[aria-pressed="true"]',
                  ":focus-visible", ":hover:not(:disabled)"):
        assert state in CSS
    assert "--gm-success-bg" in CSS and "--gm-danger-text" in CSS
    assert "--gm-warning-bg" in CSS and "--gm-info-text" in CSS


def test_meaningful_status_colours_remain_separate():
    light = CSS.split(':root[data-garamaal-theme="light"] {', 1)[1].split(
        ':root[data-garamaal-theme="dark"] {', 1)[0]
    dark = CSS.split(':root[data-garamaal-theme="dark"] {', 1)[1].split(
        '/* Semantic aliases', 1)[0]
    for area in (light, dark):
        pairs = [("--gm-success-text", "--gm-success-bg"),
                 ("--gm-warning-text", "--gm-warning-bg"),
                 ("--gm-danger-text", "--gm-danger-bg"),
                 ("--gm-info-text", "--gm-info-bg")]
        for fg, bg in pairs:
            assert fg in area and bg in area
    assert ".tag-ok" in CSS and ".tag-warn" in CSS and ".tag-red" in CSS
    assert ".toast.error" in CSS


def test_no_self_referential_design_tokens():
    assert "--gm-border:var(--gm-border)" not in CSS
    assert "color-scheme:dark;" in CSS and "color-scheme:light;" in CSS
