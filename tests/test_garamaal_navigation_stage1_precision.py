"""Stage 1: visual-only navigation precision contracts and feature preservation."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
THEME = (ROOT / "standalone/garamaal_theme.css").read_text(encoding="utf-8")
NAV = (ROOT / "standalone/mobile_jobs_hub.js").read_text(encoding="utf-8")
SHELL = (ROOT / "standalone/mobile_home_shell.js").read_text(encoding="utf-8")


def test_stage1_original_five_actions_and_back_handler_are_untouched():
    tabs = [("dashboard", "Dashboard"), ("discovery", "Discovery"),
            ("swipe", "Swipe"), ("fresh", "Make CV"), ("more", "More")]
    for action, label in tabs:
        assert f'["{action}","{label}"' in NAV
        assert f'button[data-g3-jobs="{action}"]' in THEME
    assert 'bar.addEventListener("click",e=>' in NAV
    assert 'if(button)selectPage(button.dataset.g3Jobs)' in NAV
    assert 'window.GaramaalJobsHub=Object.freeze({selectPage,openSwipe,closeMore:hideOverlay})' in NAV
    assert 'homeButton.addEventListener("click",showHome)' in SHELL


def test_glaze_clipped_inside_round_button_not_entire_dock():
    assert 'position:relative!important;isolation:isolate!important;overflow:hidden!important;' in THEME
    assert 'z-index:125!important;overflow:visible!important;box-sizing:border-box!important' in THEME
    assert 'button::before{\n z-index:0!important;clip-path:none!important;' in THEME
    assert 'clip-path:inset(0 round 15px)' not in THEME
    assert 'button::after{position:relative!important;z-index:1!important}' in THEME
    assert '@keyframes gmRoyalNavSheen' in THEME


def test_exact_selected_hover_and_dark_light_palettes():
    assert THEME.count('--royal-active-hover:#965638;') == 2
    assert 'background:var(--royal-active-hover)!important;' in THEME
    assert 'border-color:var(--royal-active-hover)!important;color:#FFFFFF!important' in THEME
    assert 'filter:brightness(1.065)!important' not in THEME
    for color in ('#A76543', '#30231E', '#211A16', '#EDE2D5', '#FFFDF9',
                  '#49342A', '#F0DED2', '#5B4032', '#DCC8B8', '#E2B08B'):
        assert color in THEME


def test_icons_back_alignment_and_mobile_space():
    assert '-webkit-mask-image:var(--royal-glyph)!important' in THEME
    assert '-webkit-mask-image:var(--royal-back-glyph)!important' in THEME
    assert 'width:46px!important;height:46px!important' in THEME
    assert 'border:1px solid var(--royal-border)!important;border-radius:50%!important' in THEME
    assert 'background:var(--royal-hover)!important;color:var(--royal-back-icon)!important;' in THEME
    assert 'background-size:auto!important;background-position:center!important;overflow:hidden!important;' in THEME
    assert 'body.gmv3-landing nav#gmv3-jobs-tabbar.gmv3-tabbar' in THEME
    assert 'width:calc(100% - 16px)!important' in THEME
    assert 'padding-bottom:calc(121px + env(safe-area-inset-bottom))' in THEME
    assert ':focus-visible' in THEME
    assert '@media(prefers-reduced-motion:reduce)' in THEME
    assert 'translateY(1px) scale(.965)' in THEME


def test_hover_copper_contrast_with_white():
    def linear(v):
        v = int(v, 16) / 255
        return v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4

    def luminance(rgb):
        return sum(c * linear(rgb[1 + 2 * i:3 + 2 * i])
                   for i, c in enumerate((.2126, .7152, .0722)))

    background = luminance('#965638')
    assert (1.05 / (background + .05)) >= 4.5
