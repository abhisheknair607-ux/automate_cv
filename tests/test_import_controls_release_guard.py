"""Release guards for user-approved manual alert and duplicate controls."""
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "standalone" / "deploy-import-controls.sh"
S = SCRIPT.read_text(encoding="utf-8")

def test_manual_release_is_guarded_and_candidate_safe():
    subprocess.run(["bash", "-n", str(SCRIPT)], check=True)
    assert 'MODE="${1:---plan}"' in S
    assert '--update-env-vars=ALLOW_ALERT_WORKFLOW_DISPATCH=true,ALLOW_DUP_STATUS_WRITES=true,GARAMAAL_ALERT_IMPORT_APPROVED=true' in S
    assert S.count("--update-env-vars=") == 1
    assert 'approved={"ALLOW_ALERT_WORKFLOW_DISPATCH","ALLOW_DUP_STATUS_WRITES","GARAMAAL_ALERT_IMPORT_APPROVED","ALLOW_JD_RECOVERY_DISPATCH","GARAMAAL_JD_RECOVERY_APPROVED"}' in S
    assert 'for endpoint in jd-recovery/status jd-recovery/run' in S
    assert '[[ "$code" == "401" ]]' in S
    assert 'JD recovery running' in S
    assert 'if key not in approved:' in S
    assert 'Existing environment or secret changed' in S
    assert '"GITHUB_WORKFLOW_TOKEN"' in S
    assert '"APP_ALLOW_PRODUCTION_WRITES":"true"' in S
    assert 'PROMOTION_ATTEMPTED=1' in S
    assert 'trap rollback ERR' in S
    assert '--no-traffic --tag' in S
    assert '--to-revisions="$BASELINE"' in S
    assert 'firebase deploy' not in S
    assert 'GARAMAAL_DEDUPE_STATUS_APPROVED=true' not in S

def test_import_requires_user_confirmed_workflow_approval():
    workflow = (ROOT / ".github/workflows/linkedin-alerts-to-taaza.yml").read_text(encoding="utf-8")
    server = (ROOT / "standalone/server.js").read_text(encoding="utf-8")
    page = (ROOT / "garamaal-release-webapp/Index.html").read_text(encoding="utf-8")
    assert 'inputs.approval ==' in workflow
    assert '"$APPROVAL" != "IMPORT_VALIDATED_JOBS"' in workflow
    assert "confirmed:req.body?.confirm===true" in server
    assert "if(kind==='apply'&&!window.confirm(" in page
    assert "confirm:kind==='apply'" in page

def test_discov_dup_remains_single_column_write_and_manual_only():
    backend = (ROOT / "standalone/server.js").read_text(encoding="utf-8")
    duplicate = (ROOT / "standalone/duplicate_status.js").read_text(encoding="utf-8")
    assert 'app.post("/api/duplicates/mark"' in backend
    assert 'process.env.ALLOW_DUP_STATUS_WRITES!=="true"' in backend
    assert 'quote("Q"+row)' in duplicate
    assert 'if(JSON.stringify(recheck)!==JSON.stringify(current))' in duplicate
    assert "deleteDimension" not in duplicate
