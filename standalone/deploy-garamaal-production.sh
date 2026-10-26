#!/usr/bin/env bash
# Production release only after explicit approval. No credentials or Sheets writes.
# Deploy latest main as a 0%-traffic canary, verify, promote, and auto-rollback
# the Cloud Run traffic split if any subsequent check fails.
set -Eeuo pipefail
MODE="${1:---plan}"
if [[ "$MODE" != "--plan" && "$MODE" != "--release" ]]; then
  echo "Usage: $0 [--plan|--release]" >&2
  exit 2
fi
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="abhishek-cv-automation"
REGION="europe-west1"
SERVICE="automate-cv-dashboard"
TAG="stage5qa"
for cmd in git python3 gcloud curl; do
  command -v "$cmd" >/dev/null || { echo "$cmd not installed" >&2; exit 2; }
done
[[ "$(git -C "$ROOT" branch --show-current)" == "main" ]] ||
  { echo "Use the latest clean main branch; aborting" >&2; exit 2; }
git -C "$ROOT" diff --quiet
git -C "$ROOT" diff --cached --quiet
git -C "$ROOT" merge-base --is-ancestor b1fe5fa01da67c3ad197769a6608ed9a204c47b2 HEAD
[[ -f "$ROOT/Dockerfile.garamaal-ui" && -f "$ROOT/garamaal-release-webapp/Index.html" ]] ||
  { echo "Correct Garamaal UI release files missing" >&2; exit 2; }
grep -Fq 'Import setup required' "$ROOT/garamaal-release-webapp/Index.html" ||
  { echo "Latest Import Alerts UI not present" >&2; exit 2; }
SHA="$(git -C "$ROOT" rev-parse --short HEAD)"
TMP="$(mktemp -d)"
PROMOTION_ATTEMPTED=0
BASELINE=""
rollback() {
  code=$?
  if [[ "$PROMOTION_ATTEMPTED" == "1" && -n "$BASELINE" ]]; then
    echo "Verification failed (exit $code); restoring previous Cloud Run traffic: $BASELINE" >&2
    gcloud run services update-traffic "$SERVICE" --project "$PROJECT" --region "$REGION" \
      --to-revisions="$BASELINE" --quiet || echo "ROLLBACK FAILED: restore traffic manually!" >&2
  fi
  rm -rf "$TMP"
  exit "$code"
}
trap rollback ERR
trap 'rm -rf "$TMP"' EXIT
gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format=json > "$TMP/before.json"
BASELINE="$(python3 - "$TMP/before.json" <<'PY'
import json,sys
srv=json.load(open(sys.argv[1],encoding="utf-8"))
spec=srv.get("spec",{}).get("template",{}).get("spec",{})
assert spec.get("serviceAccountName")=="automate-cv-pilot-reader@abhishek-cv-automation.iam.gserviceaccount.com", "Cloud Run runtime identity changed"
containers=spec.get("containers",[])
assert len(containers)==1, "Cloud Run container layout changed"
env={v["name"]:v.get("value") for v in containers[0].get("env",[])}
for k,v in {
 "APP_READ_ONLY":"false", "APP_ALLOW_PRODUCTION_WRITES":"true",
 "ALLOW_MANUAL_CV_DISPATCH":"true",
 "TAAZA_SPREADSHEET_ID":"1jt3WXqpnzVOYcKCpABIp-7UMUPr48kVhMkLfzGEHHZY",
 "FRESHMAL_SPREADSHEET_ID":"1ltT1gPFcpBdz1Wp_CuxkwFpfkwnnhjL316yVu3gxPCc",
}.items():
 assert env.get(k)==v, k+" changed; do not deploy"
for k in ("ALLOW_ALERT_WORKFLOW_DISPATCH","ALLOW_DUP_STATUS_WRITES","GARAMAAL_ALERT_IMPORT_APPROVED"):
 assert env.get(k)!="true", k+" must remain disabled"
traffic=[(v.get("revisionName"),int(v.get("percent",0))) for v in srv.get("status",{}).get("traffic",[]) if int(v.get("percent",0))>0]
assert traffic and sum(p for _,p in traffic)==100 and all(r for r,_ in traffic), "Unknown live Cloud Run traffic"
assert any(v.get("name")=="GITHUB_WORKFLOW_TOKEN" and v.get("valueFrom",{}).get("secretKeyRef")
 for v in containers[0].get("env",[])), "Existing GitHub workflow secret is missing"
print(",".join(f"{r}={p}" for r,p in traffic))
PY
)"
echo "Release source: $SHA"
echo "Rollback baseline: $BASELINE"
if [[ "$MODE" == "--plan" ]]; then
  echo "PLAN OK: no deployment or traffic change"
  exit 0
fi
mkdir -p "$TMP/build"
cp "$ROOT/Dockerfile.garamaal-ui" "$TMP/build/Dockerfile"
cp "$ROOT/package.json" "$TMP/build/package.json"
cp -R "$ROOT/standalone" "$TMP/build/standalone"
cp -R "$ROOT/garamaal-release-webapp" "$TMP/build/garamaal-release-webapp"
gcloud run deploy "$SERVICE" --source "$TMP/build" --project "$PROJECT" --region "$REGION" \
  --no-traffic --tag "$TAG" --quiet
gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format=json > "$TMP/canary.json"
readarray -t TAG_DATA < <(python3 - "$TMP/before.json" "$TMP/canary.json" "$TAG" <<'PY'
import json,sys
before,after=(json.load(open(f,encoding="utf-8")) for f in sys.argv[1:3])
def active(s):
 return sorted((v.get("revisionName"),int(v.get("percent",0))) for v in s.get("status",{}).get("traffic",[]) if int(v.get("percent",0))>0)
assert active(before)==active(after), "Canary unexpectedly changed live traffic"
tags=[v for v in after.get("status",{}).get("traffic",[]) if v.get("tag")==sys.argv[3]]
assert len(tags)==1 and int(tags[0].get("percent",0))==0, "Canary must stay at 0% traffic"
print(tags[0].get("revisionName",""))
print(tags[0].get("url",""))
PY
)
REV="${TAG_DATA[0]:-}"
URL="${TAG_DATA[1]:-}"
[[ "$REV" == automate-cv-dashboard-* && "$URL" == https://* ]] ||
 { echo "Canary URL or revision missing" >&2; exit 2; }
curl -fsSL --max-time 30 "$URL/health" | python3 -c \
  'import json,sys; x=json.load(sys.stdin); assert x.get("ok") is True and x.get("readOnly") is False'
curl -fsSL --max-time 30 "$URL/prototype" | grep -Fq 'Import setup required'
echo "CANARY HEALTHY: $REV, 0% production traffic"
PROMOTION_ATTEMPTED=1
gcloud run services update-traffic "$SERVICE" --project "$PROJECT" --region "$REGION" \
  --to-revisions="$REV=100" --quiet
gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format=json > "$TMP/production.json"
python3 - "$TMP/production.json" "$REV" <<'PY'
import json,sys
srv=json.load(open(sys.argv[1],encoding="utf-8"))
active=[v for v in srv.get("status",{}).get("traffic",[]) if int(v.get("percent",0))>0]
assert len(active)==1 and active[0].get("revisionName")==sys.argv[2] and int(active[0]["percent"])==100
PY
curl -fsSL --max-time 45 "https://garamaal.web.app/prototype?release=$SHA" | grep -Fq 'Import setup required'
PROMOTION_ATTEMPTED=0
echo "PRODUCTION VERIFIED: https://garamaal.web.app/prototype"
echo "Revision: $REV (100%); rollback baseline: $BASELINE"
echo "Gmail writes, automatic Dup Q updates, and historical deletion remain disabled."
