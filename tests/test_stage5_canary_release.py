"""Stage 5 is a zero-traffic, opt-in canary. No Cloud Run API calls in tests."""
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "standalone/deploy-stage5-canary.sh"
SRC = SCRIPT.read_text(encoding="utf-8")


def test_canary_bash_parses_without_execution():
    subprocess.run(["bash", "-n", str(SCRIPT)], check=True)


def test_plan_default_and_explicit_deploy_only():
    assert 'MODE="${1:---plan}"' in SRC
    assert '"$MODE" == "--plan"' in SRC
    assert '"$MODE" != "--deploy-canary"' in SRC
    assert SRC.index('if [[ "$MODE" == "--plan" ]]') < SRC.index('gcloud run deploy')


def test_correct_ui_image_and_no_legacy_deployment():
    assert 'cp "$ROOT/Dockerfile.garamaal-ui" "$TMP/build/Dockerfile"' in SRC
    assert 'cp -R "$ROOT/garamaal-release-webapp" "$TMP/build/garamaal-release-webapp"' in SRC
    assert 'cp -R "$ROOT/standalone" "$TMP/build/standalone"' in SRC
    assert 'gcloud run deploy "$SERVICE" --source "$TMP/build"' in SRC
    assert 'bash standalone/deploy.sh' not in SRC
    assert 'bash standalone/deploy-live-update.sh' not in SRC


def test_canary_never_changes_live_traffic_or_credentials():
    assert '--no-traffic --tag "$TAG" --quiet' in SRC
    assert "active(before)==active(after)" in SRC
    assert 'get("percent",0))==0' in SRC
    assert "ALLOW_ALERT_WORKFLOW_DISPATCH" in SRC
    assert "ALLOW_DUP_STATUS_WRITES" in SRC
    assert "GARAMAAL_ALERT_IMPORT_APPROVED" in SRC
    for forbidden in ("--update-env-vars", "--set-env-vars", "--set-secrets", "services update-traffic"):
        # Only a comment may mention the forbidden command; no execution line.
        assert all(forbidden not in line for line in SRC.splitlines() if not line.lstrip().startswith("#"))


def test_cloud_run_metadata_is_never_sent_to_build():
    assert 'gcloud run services describe' in SRC
    assert '> "$TMP/before.json"' in SRC
    assert '> "$TMP/after.json"' in SRC
    assert '--source "$TMP/build"' in SRC
    assert "cp \"$TMP/before.json\"" not in SRC
    assert "cp \"$TMP/after.json\"" not in SRC


def test_release_is_pinned_to_approved_stage4_merge():
    assert "b1fe5fa01da67c3ad197769a6608ed9a204c47b2" in SRC


def test_one_time_canary_workflow_requires_explicit_marker_commit():
    action = (ROOT / ".github/workflows/taaza-stage5-approved-canary.yml").read_text(
        encoding="utf-8"
    )
    assert "name: garamaal-stage5-approved-zero-traffic-canary" in action
    assert "release/taaza-stage5-canary-20261026" in action
    assert "docs/taaza-stage5-canary-trigger-20261026.txt" in action
    assert "git diff-tree --no-commit-id --name-only -r HEAD" in action
    assert "APPROVED: 0% Cloud Run canary only; no production traffic, imports or Q writes" in action
    assert "id-token: write" in action
    assert "google-github-actions/auth@v3" in action
    assert "bash standalone/deploy-stage5-canary.sh --deploy-canary" in action
    assert "workflow_dispatch:" not in action
    assert "schedule:" not in action
    assert "branches: [main]" not in action
