"""Stage 3 UI checks: no CV logic changes or automatic import/deletion."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = (ROOT / "garamaal-release-webapp" / "Index.html").read_text()
FILTERS = (ROOT / "standalone" / "mobile_jobs_filters_stats.js").read_text()


def test_dashboard_ribbon_and_import_popup():
    assert "<strong>Master Controls</strong>" in INDEX
    start = INDEX.index('data-action="copy-ranking"')
    assert start < INDEX.index('data-action="import-alerts"', start) < INDEX.index('data-action="repair-ranks"', start)
    assert "Check Duplicates · Python audit" in INDEX
    assert "No Google Sheet will be updated by opening this popup." in INDEX


def test_discovery_dup_button_immediately_after_preferences():
    p = INDEX.index("function preferenceMenu(job)")
    end = INDEX.index("function nextPreferenceValue(", p)
    section = INDEX[p:end]
    assert "'Not Interested','trash'" in section
    assert "'Favorite','heart'" in section
    assert "data-action=\"duplicate-toggle\"" in section
    assert "state.section==='discovery'" in section
    assert "aria-pressed=" in section
    assert "Dup</button>" in section


def test_manual_duplicate_action_is_authenticated_and_scoped():
    assert "window.__cvStandalone.requestSpecial('duplicates/mark'" in INDEX
    assert "row,status,expected:expected(job)" in INDEX
    assert "status=job.duplicateStatus==='Dup'?'':'Dup'" in INDEX
    assert "if(a==='duplicate-toggle'){toggleDuplicate(row);return}" in INDEX
    assert "if(!job.duplicateSchemaReady)" in INDEX


def test_duplicate_presets_and_grouping_are_discovery_only():
    assert '"duplicates","Duplicates (all flagged)"' in FILTERS
    assert '"possible-duplicates","Possible duplicates"' in FILTERS
    assert '"confirmed-duplicates","Confirmed duplicates"' in FILTERS
    assert '"all-including-duplicates","All including duplicates"' in FILTERS
    assert 's==="discovery"?[["duplicate-group","Group duplicates"]]' in FILTERS
    fresh = FILTERS.split("fresh:[[", 1)[1].split("]]", 1)[0]
    assert "possible-duplicates" not in fresh


def test_no_destructive_sheet_ops_or_paid_model_calls_added_to_popup():
    popup = INDEX.split('/* Import Alerts control lives in the Jobs dashboard', 1)[1]
    assert "fetch(" not in popup
    assert "google.script.run" not in popup
    assert "workflow_dispatch" not in popup
    assert "deleteDimension" not in popup
