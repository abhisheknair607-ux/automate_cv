"""Safety checks for the staged, information-only dashboard Import Alerts popup."""
from pathlib import Path

PAGE = Path(__file__).resolve().parents[1] / "garamaal-release-webapp" / "Index.html"
SOURCE = PAGE.read_text(encoding="utf-8")


def test_import_alert_button_immediately_follows_copy_ranking_prompt():
    needle = 'data-action="copy-ranking">'
    pos = SOURCE.index(needle)
    end = SOURCE.index("</button>", pos)
    inserted = SOURCE.index('data-action="import-alerts"', end)
    repair = SOURCE.index('data-action="repair-ranks"', end)
    assert end < inserted < repair
    assert inserted - end < 220
    assert "Import Alerts</button>" in SOURCE[end:repair]


def test_popup_is_compact_accessible_and_mobile_responsive():
    assert 'id="importAlertsMount"' in SOURCE
    assert 'class="alerts-pop" role="dialog" aria-modal="true"' in SOURCE
    assert "aria-labelledby=" in SOURCE
    assert "@media(max-width:480px){.alerts-shade" in SOURCE
    assert 'if(e.key==="Escape")' in SOURCE
    assert 'if(e.key!=="Tab")' in SOURCE
    assert 'data-alert-dismiss="close"' in SOURCE


def test_popup_does_not_trigger_import_before_user_parser_approval():
    # The three controls are initially disabled and enabled only by a
    # successful authenticated status response.
    for kind in ("preview", "dedupe", "apply"):
        assert f'data-alert-run="{kind}" disabled' in SOURCE
    assert 'id="alerts-live-status"' in SOURCE
    popup_script = SOURCE.split('/* Import Alerts control lives in the Jobs dashboard', 1)[1]
    assert "fetch(" not in popup_script
    assert "google.script.run" not in popup_script
    assert "requestSpecial(" not in popup_script
    assert "workflow_dispatch" not in popup_script
    assert "Actions ↗" in popup_script
    assert "Workflow ↗" in popup_script
    assert "Audit ↗" in popup_script
    assert "if(!button||button.disabled)return;" in popup_script
    assert "data.applyEnabled" in popup_script
