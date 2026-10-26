#!/usr/bin/env bash
# Deploy ONLY a new source revision to the existing live Cloud Run dashboard.
# Preserves production Firebase settings, Sheet IDs, GitHub secret, manual CV
# dispatch, IAM and scheduler. Never calls standalone/deploy.sh: it resets env.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="abhishek-cv-automation"
REGION="europe-west1"
SERVICE="automate-cv-dashboard"
echo "Verifying the live service's safety gates and GitHub secret..."
check_revision() {
  gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format=json | python3 -c '
import json,sys
x=json.load(sys.stdin)
spec=x.get("spec",{}).get("template",{}).get("spec",{})
assert spec.get("serviceAccountName")=="automate-cv-pilot-reader@abhishek-cv-automation.iam.gserviceaccount.com", "Unexpected runtime account"
items=spec.get("containers",[])
assert items,"No deployed container"
env={e["name"]:e for e in items[0].get("env",[])}
required={
  "APP_READ_ONLY":"false",
  "APP_ALLOW_PRODUCTION_WRITES":"true",
  "ALLOW_MANUAL_CV_DISPATCH":"true",
  "TAAZA_SPREADSHEET_ID":"1jt3WXqpnzVOYcKCpABIp-7UMUPr48kVhMkLfzGEHHZY",
  "FRESHMAL_SPREADSHEET_ID":"1ltT1gPFcpBdz1Wp_CuxkwFpfkwnnhjL316yVu3gxPCc",
}
for name,value in required.items():
  assert env.get(name,{}).get("value")==value,f"{name} changed or missing. Aborting."
assert env.get("GITHUB_WORKFLOW_TOKEN",{}).get("valueFrom",{}).get("secretKeyRef"), "GitHub secret not attached"
print("Live safety gates and GitHub secret verified.")
'
}
check_revision
DEPLOY_DIR="$(mktemp -d)"
trap 'rm -rf "$DEPLOY_DIR"' EXIT
cp "$ROOT/package.json" "$DEPLOY_DIR/package.json"
cp -R "$ROOT/webapp" "$DEPLOY_DIR/webapp"
cp -R "$ROOT/standalone" "$DEPLOY_DIR/standalone"
cp "$ROOT/Dockerfile.standalone" "$DEPLOY_DIR/Dockerfile"
echo "Deploying updated queue dashboard without replacing live environment variables..."
gcloud run deploy "$SERVICE" --source="$DEPLOY_DIR" --project="$PROJECT" --region="$REGION" --quiet
check_revision
URL="$(gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format='value(status.url)')"
curl -fsS --max-time 30 "$URL/health" | python3 -c 'import sys,json; d=json.load(sys.stdin); assert d.get("ok") and d.get("readOnly") is False, "Live dashboard health/read-write check failed"'
echo "DEPLOYED: Refresh $URL to see live CV queue animations and positions."
echo "Existing manual GitHub dispatch and production write settings are preserved."
