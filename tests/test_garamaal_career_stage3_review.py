"""Stage 4: activate approved V9-curve journey, preserve old V9 and V10.3 review routes."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SERVER = (ROOT / "standalone/server.js").read_text(encoding="utf-8")
REVIEW = (ROOT / "standalone/garamaal_career_trail_v10_review.html").read_text(encoding="utf-8")
BRIDGE = (ROOT / "standalone/garamaal_theme_bridge.js").read_text(encoding="utf-8")


def test_approved_stage3b_is_live_and_v9_remains_recoverable():
    assert 'app.get("/prototype/career-trail",(_req,res)=>' in SERVER
    assert 'sendFile(path.join(__dirname,"garamaal_career_trail_curve_review.html"))' in SERVER
    assert 'app.get("/prototype/career-trail-v9",(_req,res)=>' in SERVER
    assert 'sendFile(path.join(__dirname,"garamaal_career_trail_v9.html"))' in SERVER
    assert 'app.get("/prototype/career-trail-v10-review",(_req,res)=>' in SERVER
    assert 'sendFile(path.join(__dirname,"garamaal_career_trail_v10_review.html"))' in SERVER
    assert 'src="/prototype/career-trail"' in SERVER
    assert "garamaal_career_trail_v10_review.html" not in BRIDGE


def test_four_original_choices_plus_scroll_chapter_actions_are_retained():
    for action, label in (
        ("profile", "Update Profile"), ("jobs", "Apply Jobs"),
        ("network", "Network"), ("stats", "Statistics"),
    ):
        assert f'data-gm-action="{action}"' in REVIEW
        assert f'aria-label="{label}"' in REVIEW
        assert f'case "{action}":' in BRIDGE
    assert REVIEW.count('class="feature-card"') == 7
    assert 'id="overview"' in REVIEW
    for section in ('jobs', 'network', 'stats'):
        assert f'id="{section}"' in REVIEW


def test_photography_is_independent_from_buttons():
    assert REVIEW.count('data:image/webp;base64,') >= 11
    assert REVIEW.count('class="edge-photo"') == 4
    assert 'id="gm-stage3-guideway"' in REVIEW
    assert '.overview-cards{' in REVIEW
    assert '.chapter.alt .chapterside{' in REVIEW
    assert 'mask-composite:intersect' in REVIEW


def test_copper_ball_follows_actual_path_with_clear_mobile_gutter():
    assert "path.getPointAtLength(mid).y<targetY" in REVIEW
    assert "sections[i].offsetTop+sections[i].offsetHeight" in REVIEW
    assert "let boundary=sections[i].offsetTop+sections[i].offsetHeight" in REVIEW
    assert "boundary-48" in REVIEW and "boundary+48" in REVIEW
    assert "outer=Math.max(34,w*.09)" in REVIEW
    assert "i===2?w-outer:outer" in REVIEW
    assert "requestAnimationFrame(draw)" in REVIEW
    assert "window.parent.postMessage({type:'garamaal-career-action'" in REVIEW


def test_ball_reaction_and_theme_respect_original_controls():
    for name in ("--photoDrift", "--cardDrift", "--copyDrift",
                 "--ballLift", "--ballGlow"):
        assert name in REVIEW
    assert "prefers-reduced-motion:reduce" in REVIEW
    assert "garamaal-theme-set" in REVIEW
    assert "garamaal-return-home" in REVIEW
    assert "--paper:#EDE2D5" in REVIEW
    assert "--paper:#211A16" in REVIEW
    assert "--copper:#A76543" in REVIEW
