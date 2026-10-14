#!/usr/bin/env bash
# Isolated Cloud Run deployment. DOES NOT modify the live Apps Script or CV worker.
# Run from Google Cloud Shell after the one-time Firebase setup.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${GOOGLE_CLOUD_PROJECT:?Set GOOGLE_CLOUD_PROJECT (your Google Cloud project ID)}"
: "${FIREBASE_WEB_API_KEY:?Set FIREBASE_WEB_API_KEY from Firebase web app settings}"
: "${FIREBASE_WEB_APP_ID:?Set FIREBASE_WEB_APP_ID from Firebase web app settings}"
: "${ALLOWED_EMAILS:?Set ALLOWED_EMAILS to authorised candidate Google emails}"
: "${CV_RUNTIME_SERVICE_ACCOUNT:?Set CV_RUNTIME_SERVICE_ACCOUNT (Google Cloud service account address shared on BOTH sheets)}"
REGION="${CV_REGION:-europe-west1}"
SERVICE="${CV_SERVICE_NAME:-automate-cv-dashboard}"
TAAZA="${TAAZA_SPREADSHEET_ID:-1jt3WXqpnzVOYcKCpABIp-7UMUPr48kVhMkLfzGEHHZY}"
FRESH="${FRESHMAL_SPREADSHEET_ID:-1ltT1gPFcpBdz1Wp_CuxkwFpfkwnnhjL316yVu3gxPCc}"
STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT
cp "$ROOT/package.json" "$STAGING/package.json"
cp -R "$ROOT/standalone" "$STAGING/standalone"
cp -R "$ROOT/webapp" "$STAGING/webapp"
cp "$ROOT/Dockerfile.standalone" "$STAGING/Dockerfile"
cat > "$STAGING/.gcloudignore" <<'EOF'
.git
node_modules
*.log
.env
*.json.secret
EOF
gcloud config set project "$GOOGLE_CLOUD_PROJECT"
# Billing activation and permission approvals are performed by the user.
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com sheets.googleapis.com --project="$GOOGLE_CLOUD_PROJECT"
printf '%s\n' "Deploying isolated dashboard. Existing CV automation unchanged."
gcloud run deploy "$SERVICE" \
  --source="$STAGING" \
  --project="$GOOGLE_CLOUD_PROJECT" \
  --region="$REGION" \
  --service-account="$CV_RUNTIME_SERVICE_ACCOUNT" \
  --allow-unauthenticated \
  --min-instances=0 \
  --max-instances=1 \
  --concurrency=1 \
  --timeout=300 \
  --cpu=1 \
  --memory=512Mi \
  --set-env-vars="GOOGLE_CLOUD_PROJECT=$GOOGLE_CLOUD_PROJECT,FIREBASE_PROJECT_ID=$GOOGLE_CLOUD_PROJECT,FIREBASE_WEB_API_KEY=$FIREBASE_WEB_API_KEY,FIREBASE_WEB_APP_ID=$FIREBASE_WEB_APP_ID,FIREBASE_AUTH_DOMAIN=$GOOGLE_CLOUD_PROJECT.firebaseapp.com,ALLOWED_EMAILS=$ALLOWED_EMAILS,TAAZA_SPREADSHEET_ID=$TAAZA,FRESHMAL_SPREADSHEET_ID=$FRESH" \
  --quiet
printf '\n%s\n' "Cloud Run deployed. Add its hostname to Firebase Authentication > Settings > Authorized domains."
printf '%s\n' "For Run CV Now: attach a GitHub token via Google Secret Manager. Never include it in browser code."
