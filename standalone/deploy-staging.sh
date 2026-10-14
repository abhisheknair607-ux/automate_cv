#!/usr/bin/env bash
# Isolated WRITE-TEST staging deployment. Never updates the live pilot or CV worker.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${GOOGLE_CLOUD_PROJECT:?Set GOOGLE_CLOUD_PROJECT}"
: "${TAAZA_SPREADSHEET_ID:?Set ID of Taaza working COPY, not production}"
: "${FRESHMAL_SPREADSHEET_ID:?Set ID of Freshmaal working COPY, not production}"
if [[ "$GOOGLE_CLOUD_PROJECT" != "abhishek-cv-automation" ]]; then
  echo "Refusing staging deployment to an unexpected project" >&2
  exit 2
fi
if [[ "$TAAZA_SPREADSHEET_ID" == "1jt3WXqpnzVOYcKCpABIp-7UMUPr48kVhMkLfzGEHHZY" ||
      "$FRESHMAL_SPREADSHEET_ID" == "1ltT1gPFcpBdz1Wp_CuxkwFpfkwnnhjL316yVu3gxPCc" ||
      "$TAAZA_SPREADSHEET_ID" == "$FRESHMAL_SPREADSHEET_ID" ]]; then
  echo "Refusing staging deployment: production sheet ID or duplicate sheet ID" >&2
  exit 2
fi
export CV_SERVICE_NAME="automate-cv-staging"
echo "Deploying automate-cv-staging initially READ-ONLY against sheet copies."
bash "$ROOT/standalone/deploy.sh"
echo "Verify /health readOnly:true and Bootstrap sheet links before enabling staging writes."
