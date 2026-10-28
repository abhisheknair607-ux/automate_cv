"""Stage 4 approval: only the V9 launcher artwork changes; app controls remain intact."""
from pathlib import Path
import re
import subprocess

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/"standalone"
SERVER=(BASE/"server.js").read_text(encoding="utf-8")
BRIDGE=(BASE/"garamaal_theme_bridge.js").read_text(encoding="utf-8")
ORIGINAL=(BASE/"garamaal_career_trail_v9.html").read_text(encoding="utf-8")
APPROVED=(BASE/"garamaal_career_trail_curve_review.html").read_text(encoding="utf-8")
THEME=(BASE/"garamaal_royal_pages.css").read_text(encoding="utf-8")
ART=(BASE/"garamaal_curve_art_review.js").read_text(encoding="utf-8")
OVERLAY=(BASE/"garamaal_curve_overlay_review.js").read_text(encoding="utf-8")
RELEASE=(BASE/"deploy-garamaal-production.sh").read_text(encoding="utf-8")


def test_live_launcher_uses_approved_art_and_same_exact_original_v9_roller():
    live=SERVER.split('app.get("/prototype/career-trail",',1)[1].split(');',1)[0]
    old=SERVER.split('app.get("/prototype/career-trail-v9",',1)[1].split(');',1)[0]
    assert 'garamaal_career_trail_curve_review.html' in live
    assert 'garamaal_career_trail_v9.html' not in live
    assert 'garamaal_career_trail_v9.html' in old
    assert 'src="/prototype/career-trail"' in SERVER
    for mark in ('id="global-track"', 'id="global-ball"', 'id="gm9-orb"',
                 'id="global-path"', "window.GaramaalV9Sphere?.draw"):
        assert mark in ORIGINAL and mark in APPROVED
    assert len(APPROVED)>len(ORIGINAL)
    assert '<script src="/prototype/curve-art-review.js?v=3b"></script>' in APPROVED
    assert '<script src="/prototype/curve-overlay-review.js?v=3b"></script>' in APPROVED


def test_real_actions_handoff_not_fake_demo_clicks():
    assert "button.dataset.entry=action" in OVERLAY
    for action in ("profile","jobs","network","stats"):
        assert f"case \"{action}\":" in BRIDGE
    assert "event.target.closest?.('[data-entry]')" in ORIGINAL
    assert "parent.postMessage({type:'garamaal-career-action',action}" in ORIGINAL
    assert 'homeButton.addEventListener("click",showHome)' in (
       BASE/"mobile_home_shell.js").read_text(encoding="utf-8")
    assert 'window.GaramaalJobsHub=Object.freeze({selectPage,openSwipe,closeMore:hideOverlay})' in (
       BASE/"mobile_jobs_hub.js").read_text(encoding="utf-8")


def test_copper_palettes_present_and_native_pages_only_visual_css():
    for c in ("#A76543","#965638","#30231E","#211A16","#EDE2D5","#FFFDF9"):
        assert c in THEME
    assert '--gm-success-bg' in THEME and '--gm-danger-text' in THEME
    assert 'nav#gmv3-jobs-tabbar' not in THEME
    assert 'body.gmv3-landing' not in THEME


def test_release_guard_checks_actual_new_homepage_before_promoting():
    assert 'curl -fsSL --max-time 30 "$URL/prototype/career-trail"' in RELEASE
    assert 'STAGE 4 CANARY UI VERIFIED' in RELEASE
    assert 'garamaal-royal' not in SERVER # Only the route's specified token file is used.
    assert 'grep -Fq -- \'--gm-brand:#A76543\'' in RELEASE
    assert 'grep -Fq \'id="global-ball"\'' in RELEASE
    assert 'grep -Fq \'src="/prototype/career-trail"\'' in RELEASE
    assert '--no-traffic --tag' in RELEASE
    assert 'trap rollback ERR' in RELEASE
    subprocess.run(["bash","-n",str(BASE/"deploy-garamaal-production.sh")],check=True)


def test_eight_distinct_photographic_assets_and_attribution():
    urls=re.findall(r"https://images\.unsplash\.com/photo-[^\"\s]+",ART)
    assert len(set(urls))==8
    assert ART.count("https://unsplash.com/photos/")>=8
