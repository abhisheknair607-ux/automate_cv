#!/usr/bin/env bash
# Register and deploy one concise Firebase Hosting URL as a proxy.
# No Cloud Run revisions, sheets, scheduler, GitHub tokens or Firebase Auth users change.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="abhishek-cv-automation"
SITE="freshmaal-cv"
REGION="europe-west1"
SERVICE="automate-cv-dashboard"
cd "$ROOT"
if ! command -v firebase >/dev/null 2>&1; then
  echo "Installing Firebase CLI (requires Cloud Shell user npm permission)..."
  npm install --global firebase-tools
fi
echo "Checking Google Cloud active project and Cloud Run service..."
gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format='value(status.url)' | grep -q 'https://'
echo "Creating the short Hosting site, if it does not exist for this project..."
if ! firebase hosting:sites:get "$SITE" --project "$PROJECT" >/dev/null 2>&1; then
  firebase hosting:sites:create "$SITE" --project "$PROJECT"
fi
firebase deploy --only hosting --project "$PROJECT" --non-interactive
echo "SHORT LINK: https://$SITE.web.app"
echo "Firebase Hosting proxies to the existing live, authenticated Cloud Run dashboard."
echo "In Firebase Authentication settings, add '$SITE.web.app' as an authorized domain if Google sign-in asks for it."
