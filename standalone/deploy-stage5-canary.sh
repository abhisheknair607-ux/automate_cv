#!/usr/bin/env bash
# Stage 5 preparation only. This script is NOT run by GitHub Actions and never
# changes the production traffic percentage or any environment variable.
# Manual explicit --deploy-canary is required; default is inspection-only.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="abhishek-cv-automation"
REGION="europe-west1"
SERVICE="automate-cv-dashboard"
TAG="stage5qa"
MODE="${1:---plan}"
if [[ "$MODE" != "--plan" && "$MODE" != "--deploy-canary" ]]; then
  echo "Usage: $0 [--plan|--deploy-canary]" >&2
  exit 2
fi
echo "Stage 5: $MODE / $PROJECT / $REGION / $SERVICE"
for binary in gcloud python3 git; do
  command -v "$binary" >/dev/null || { echo "$binary missing; cannot verify production" >&2; exit 2; }
done
git -C "$ROOT" merge-base --is-ancestor b1fe5fa01da67c3ad197769a6608ed9a204c47b2 HEAD || {
  echo "Stage 4 merge commit is not in checked-out source" >&2
  exit 2
}
# Existing deployed Cloud Run revision/settings are read but never printed with
# tokens or Firebase values. The release image uses the paired frozen UI.
[[ -f "$ROOT/Dockerfile.garamaal-ui" && -f "$ROOT/garamaal-release-webapp/Index.html" ]] ||
  { echo "Correct Garamaal release image is unavailable" >&2; exit 2; }
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format=json > "$TMP/before.json"
python3 - "$TMP/before.json" <<'PY'
import json,sys
service=json.load(open(sys.argv[1],encoding="utf-8"))
spec=service.get("spec",{}).get("template",{}).get("spec",{})
account=spec.get("serviceAccountName","")
assert account=="automate-cv-pilot-reader@abhishek-cv-automation.iam.gserviceaccount.com", "Unexpected Cloud Run runtime account"
containers=spec.get("containers",[])
assert len(containers)==1, "Unexpected Cloud Run container layout"
env={x["name"]:x.get("value") for x in containers[0].get("env",[])}
for key,expected in {
 "APP_READ_ONLY":"false",
 "APP_ALLOW_PRODUCTION_WRITES":"true",
 "ALLOW_MANUAL_CV_DISPATCH":"true",
 "TAAZA_SPREADSHEET_ID":"1jt3WXqpnzVOYcKCpABIp-7UMUPr48kVhMkLfzGEHHZY",
 "FRESHMAL_SPREADSHEET_ID":"1ltT1gPFcpBdz1Wp_CuxkwFpfkwnnhjL316yVu3gxPCc",
}.items():
 assert env.get(key)==expected, key+" has changed; cancel release"
for key in ("ALLOW_ALERT_WORKFLOW_DISPATCH","ALLOW_DUP_STATUS_WRITES","GARAMAAL_ALERT_IMPORT_APPROVED"):
 assert env.get(key)!="true", key+" must remain disabled for the Stage 5 canary"
assert any(v.get("name")=="GITHUB_WORKFLOW_TOKEN" and
 v.get("valueFrom",{}).get("secretKeyRef") for v in containers[0].get("env",[])), "Missing existing GitHub secret"
traffic=service.get("status",{}).get("traffic",[])
active=sorted((item.get("revisionName"),int(item.get("percent",0))) for item in traffic if int(item.get("percent",0))>0)
assert active and sum(p for _,p in active)==100, "Unexpected active production traffic; cannot preserve rollback"
print("Existing service account, CV controls, sheet IDs and disabled new write gates verified.")
print("Current active traffic (retain/rollback): "+", ".join(str(r)+"="+str(p)+"%" for r,p in active))
PY
if [[ "$MODE" == "--plan" ]]; then
  echo "PLAN ONLY: correct Dockerfile.garamaal-ui, no traffic, stage5qa tag; no changes made."
  exit 0
fi
command -v curl >/dev/null || { echo "curl missing" >&2; exit 2; }
mkdir -p "$TMP/build"
cp "$ROOT/Dockerfile.garamaal-ui" "$TMP/build/Dockerfile"
cp "$ROOT/package.json" "$TMP/build/package.json"
cp -R "$ROOT/standalone" "$TMP/build/standalone"
cp -R "$ROOT/garamaal-release-webapp" "$TMP/build/garamaal-release-webapp"
# Never use standalone/deploy-live-update.sh: it references a different image.
# No --set-env-vars, --update-env-vars, --set-secrets, or traffic promotion.
gcloud run deploy "$SERVICE" --source "$TMP/build" --project "$PROJECT" --region "$REGION" \
  --no-traffic --tag "$TAG" --quiet
gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format=json > "$TMP/after.json"
TAG_URL="$(python3 - "$TMP/before.json" "$TMP/after.json" "$TAG" <<'PY'
import json,sys
before=json.load(open(sys.argv[1],encoding="utf-8"))
after=json.load(open(sys.argv[2],encoding="utf-8"))
def active(state):
 return sorted((e.get("revisionName"),int(e.get("percent",0))) for e in state.get("status",{}).get("traffic",[]) if int(e.get("percent",0))>0)
assert active(before)==active(after), "Production traffic changed unexpectedly; inspect Cloud Run and restore baseline"
matches=[e for e in after.get("status",{}).get("traffic",[]) if e.get("tag")==sys.argv[3]]
assert len(matches)==1 and int(matches[0].get("percent",0))==0, "Canary must receive 0% of production traffic"
print(matches[0].get("url",""))
PY
)"
[[ "$TAG_URL" == https://* ]] || { echo "Canary tag URL missing; live traffic unchanged, investigate manually" >&2; exit 3; }
curl -fsS --max-time 30 "$TAG_URL/health" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d.get("ok") is True and d.get("readOnly") is False'
echo "STAGE 5 CANARY HEALTHY (0% live traffic): $TAG_URL"
echo "Production traffic was not promoted. Rollback retains the baseline revision(s)."
echo "Do not enable Gmail, duplicate-status writes, or promote traffic without separate approval."
