"""Safety guards for the opt-in Garamaal production traffic promotion."""
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "standalone/deploy-garamaal-production.sh"
S = SCRIPT.read_text(encoding="utf-8")


def test_release_bash_syntax_and_default_is_plan_only():
    subprocess.run(["bash", "-n", str(SCRIPT)], check=True)
    assert 'MODE="${1:---plan}"' in S
    assert '"$MODE" != "--release"' in S
    assert S.index('if [[ "$MODE" == "--plan" ]]') < S.index('gcloud run deploy')


def test_release_cannot_replace_runtime_secrets_or_worker():
    assert "Dockerfile.garamaal-ui" in S
    assert 'cp -R "$ROOT/garamaal-release-webapp"' in S
    assert 'cp -R "$ROOT/standalone"' in S
    assert "ALLOW_ALERT_WORKFLOW_DISPATCH" in S
    assert "ALLOW_DUP_STATUS_WRITES" in S
    assert "GARAMAAL_ALERT_IMPORT_APPROVED" in S
    assert "ALLOW_MANUAL_CV_DISPATCH" in S
    commands = [line for line in S.splitlines() if not line.lstrip().startswith("#")]
    assert "--update-env-vars=ALLOW_ALERT_WORKFLOW_DISPATCH=true" in S
    assert S.count("--update-env-vars=") == 1
    for forbidden in ("--set-env-vars", "--set-secrets", "firebase deploy"):
        assert not any(forbidden in line for line in commands)
    assert 'for k in ("ALLOW_DUP_STATUS_WRITES","GARAMAAL_ALERT_IMPORT_APPROVED")' in S
    assert 'Existing environment or secret changed' in S
    assert 'Unapproved write controls remain disabled' in S


def test_release_is_zero_traffic_canary_first_then_auto_rollback():
    assert "--no-traffic --tag" in S
    assert "active(before)==active(after)" in S
    assert '"$URL/health"' in S
    assert '"$URL/prototype"' in S
    assert "Live import authorisation off" in S
    assert 'PROMOTION_ATTEMPTED=1' in S
    assert 'trap rollback ERR' in S
    assert '--to-revisions="$BASELINE"' in S
    assert '--to-revisions="$REV=100"' in S
    assert "https://garamaal.web.app/prototype?release=" in S
    assert S.index("--no-traffic --tag") < S.index('--to-revisions="$REV=100"')
