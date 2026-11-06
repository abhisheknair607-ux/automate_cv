"""Dashboard popup is now read-only duplicate review; importer launches on app open."""
from pathlib import Path

PAGE = Path(__file__).resolve().parents[1] / "garamaal-release-webapp" / "Index.html"
SOURCE = PAGE.read_text(encoding="utf-8")


def test_duplicate_button_follows_ranking_prompt():
    start = SOURCE.index('data-action="copy-ranking"')
    end = SOURCE.index("</button>", start)
    inserted = SOURCE.index('data-action="duplicate-review"', end)
    repair = SOURCE.index('data-action="repair-ranks"', end)
    assert end < inserted < repair
    assert "Duplicate Review</button>" in SOURCE[end:repair]


def test_popup_accessibility_and_mobile_layout():
    assert 'id="importAlertsMount"' in SOURCE
    assert 'class="alerts-pop" role="dialog" aria-modal="true"' in SOURCE
    assert 'id="alerts-title">Duplicate Review' in SOURCE
    assert "@media(max-width:480px){.alerts-shade" in SOURCE
    assert 'if(e.key==="Escape")' in SOURCE
    assert 'if(e.key!=="Tab")' in SOURCE
    assert 'data-alert-dismiss="close"' in SOURCE


def test_popup_cannot_dispatch_github_actions():
    popup = SOURCE.split("/* Import and master sync run on Cloud Run", 1)[1]
    assert "alerts/auto/check" in popup
    assert "alerts/auto/status" in popup
    assert "pageshow" in popup
    assert "visibilitychange" in popup
    assert "setInterval(" not in popup
    assert "alerts/run" not in popup
    assert "data-alert-run=" not in popup
    assert "workflow_dispatch" not in popup
    assert "Inspect in master Sheet" in popup
