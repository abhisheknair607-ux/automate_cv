#!/usr/bin/env bash
# Approved cutover of EXISTING Cloud Run dashboard to live spreadsheet editing.
# Never updates the old Apps Script deployment or GitHub schedules.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${GOOGLE_CLOUD_PROJECT:?Set GOOGLE_CLOUD_PROJECT}"
if [[ "$GOOGLE_CLOUD_PROJECT" != "abhishek-cv-automation" ]]; then
  echo "Unexpected Cloud project, aborting." >&2; exit 2
fi
export CV_REGION="europe-west1"
export CV_SERVICE_NAME="automate-cv-dashboard"
export TAAZA_SPREADSHEET_ID="1jt3WXqpnzVOYcKCpABIp-7UMUPr48kVhMkLfzGEHHZY"
export FRESHMAL_SPREADSHEET_ID="1ltT1gPFcpBdz1Wp_CuxkwFpfkwnnhjL316yVu3gxPCc"
echo "Step 1/3: Deploy current branch READ-ONLY against LIVE spreadsheet IDs"
bash "$ROOT/standalone/deploy.sh"
URL="$(gcloud run services describe "$CV_SERVICE_NAME" --project="$GOOGLE_CLOUD_PROJECT" --region="$CV_REGION" --format="value(status.url)")"
if [[ -z "$URL" ]]; then echo "Missing service URL, aborting" >&2; exit 3; fi
echo "Step 2/3: Verify service is healthy and READ-ONLY"
curl --fail --silent --show-error --max-time 30 "$URL/health" | python3 -c 'import json,sys; h=json.load(sys.stdin); assert h.get("ok") is True and h.get("readOnly") is True, "not healthy/read-only"'
echo "Step 3/3: Enable production spreadsheet editing; keep paid manual CV dispatch disabled"
gcloud run services update "$CV_SERVICE_NAME" \
  --project="$GOOGLE_CLOUD_PROJECT" --region="$CV_REGION" \
  --update-env-vars=APP_READ_ONLY=false,APP_ALLOW_PRODUCTION_WRITES=true,ALLOW_MANUAL_CV_DISPATCH=false \
  --quiet
curl --fail --silent --show-error --max-time 30 "$URL/health" | python3 -c 'import json,sys; h=json.load(sys.stdin); assert h.get("ok") is True and h.get("readOnly") is False, "production read-write confirmation failed"'
echo "SUCCESS: live Cloud Run dashboard editing enabled: $URL"
echo "Apps Script deployment, legacy worker, staging service and spreadsheet backups remain intact."
