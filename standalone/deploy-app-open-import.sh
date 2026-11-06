#!/usr/bin/env bash
# Provision the app-open Garamaal importer. Deliberately does not merge code,
# read OAuth values, or start an import in this shell.
set -Eeuo pipefail
MODE="${1:---plan}"
[[ "$MODE" == "--plan" || "$MODE" == "--prepare" || "$MODE" == "--apply" ]] || { echo "Usage: $0 [--plan|--prepare|--apply]" >&2; exit 2; }
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
P="abhishek-cv-automation"
R="europe-west1"
SERVICE="automate-cv-dashboard"
JOB="garamaal-alert-importer"
SA="garamaal-alert-import@${P}.iam.gserviceaccount.com"
REPO="garamaal-import-jobs"
REQUIRED_SECRETS=(
 LINKEDIN_GMAIL_CLIENT_ID LINKEDIN_GMAIL_CLIENT_SECRET LINKEDIN_GMAIL_REFRESH_TOKEN
 GOOGLE_OAUTH_CLIENT_ID GOOGLE_OAUTH_CLIENT_SECRET GOOGLE_OAUTH_REFRESH_TOKEN
)
for bin in gcloud git node; do command -v "$bin" >/dev/null || { echo "Missing $bin" >&2; exit 2; }; done
gcloud run services describe "$SERVICE" --project "$P" --region "$R" --format=json >/dev/null
SITE_SA="$(gcloud run services describe "$SERVICE" --project "$P" --region "$R" --format='value(spec.template.spec.serviceAccountName)')"
[[ -n "$SITE_SA" ]] || { echo "Website service account unavailable" >&2; exit 2; }
# No Gmail tokens are ever printed. They must already exist in Secret Manager.
missing=()
for secret in "${REQUIRED_SECRETS[@]}"; do
 if ! gcloud secrets describe "$secret" --project "$P" --format='value(name)' >/dev/null 2>&1; then
  missing+=("$secret")
 fi
done
echo "Website identity: $SITE_SA"
echo "Job identity: $SA"
echo "Importer: $JOB (triggered by authenticated website opening; no cron)"
if (("${#missing[@]}" > 0)); then
 printf 'Missing Secret Manager entries: %s\n' "${missing[*]}" >&2
 echo "Move authorised Gmail and Sheets OAuth credentials into Google Secret Manager; never put them in GitHub source or a Cloud Shell transcript." >&2
 exit 3
fi
if [[ "$MODE" == "--plan" ]]; then
 echo "Preflight OK: required secret names exist. No resources changed."
 echo "Next: run this script --prepare from the tested feature branch BEFORE merging. It provisions only the disabled Cloud Run Job."
 exit 0
fi
BRANCH="$(git -C "$ROOT" branch --show-current)"
if [[ "$MODE" == "--prepare" ]]; then
 [[ "$BRANCH" == "feature/app-open-import-four-hour" ]] || { echo "Prepare only from the reviewed importer feature branch" >&2; exit 3; }
else
 [[ "$BRANCH" == "main" ]] || { echo "Apply only from the reviewed main branch" >&2; exit 3; }
fi
[[ -z "$(git -C "$ROOT" status --porcelain)" ]] || { echo "Working tree is not clean" >&2; exit 3; }
[[ -f "$ROOT/Dockerfile.garamaal-importer" ]] || exit 3
node --check "$ROOT/standalone/auto_import.js"
node --check "$ROOT/standalone/server.js"
node --check "$ROOT/standalone/bridge.js"
if ! gcloud iam service-accounts describe "$SA" --project "$P" >/dev/null 2>&1; then
 gcloud iam service-accounts create garamaal-alert-import --project "$P" --display-name="Garamaal app-open Gmail importer"
fi
for account in "$SITE_SA" "$SA"; do
 gcloud projects add-iam-policy-binding "$P" \
  --member="serviceAccount:$account" --role="roles/datastore.user" --condition=None --quiet >/dev/null
done
for secret in "${REQUIRED_SECRETS[@]}"; do
 gcloud secrets add-iam-policy-binding "$secret" --project "$P" \
  --member="serviceAccount:$SA" --role="roles/secretmanager.secretAccessor" --quiet >/dev/null
done
if ! gcloud artifacts repositories describe "$REPO" --project "$P" --location "$R" >/dev/null 2>&1; then
 gcloud artifacts repositories create "$REPO" --project "$P" \
  --repository-format=docker --location "$R" --description="Garamaal importer images" --quiet
fi
TAG="$(git -C "$ROOT" rev-parse --short HEAD)"
IMAGE="$R-docker.pkg.dev/$P/$REPO/importer:$TAG"
BUILD="$(mktemp -d)"
trap 'rm -rf "$BUILD"' EXIT
cp "$ROOT/Dockerfile.garamaal-importer" "$BUILD/Dockerfile"
cp -R "$ROOT/src" "$BUILD/src"
gcloud builds submit "$BUILD" --project "$P" --region "$R" --tag "$IMAGE" --quiet
SECRET_FLAGS=""
for secret in "${REQUIRED_SECRETS[@]}"; do
 [[ -z "$SECRET_FLAGS" ]] || SECRET_FLAGS+=","
 SECRET_FLAGS+="$secret=$secret:latest"
done
gcloud run jobs deploy "$JOB" --project "$P" --region "$R" \
 --image "$IMAGE" --service-account "$SA" \
 --tasks=1 --max-retries=0 --task-timeout=15m \
 --set-env-vars="GARAMAAL_ALERT_IMPORT_APPROVED=true,TAAZA_SPREADSHEET_ID=1jt3WXqpnzVOYcKCpABIp-7UMUPr48kVhMkLfzGEHHZY" \
 --set-secrets="$SECRET_FLAGS" --quiet
gcloud run jobs add-iam-policy-binding "$JOB" --project "$P" --region "$R" \
 --member="serviceAccount:$SITE_SA" --role="roles/run.jobsExecutorWithOverrides" --quiet >/dev/null
# This script does NOT activate imports, even with --prepare or --apply.
# Prepare the disabled Cloud Run Job first; activate only after website canary
# and production credential/permission verification.
echo "Cloud Run Job and IAM ready."
echo "Enable on-open checks only after production webapp release verification:"
echo "gcloud run services update $SERVICE --project=$P --region=$R --update-env-vars=AUTO_ALERT_IMPORT_ENABLED=true,AUTO_ALERT_IMPORT_JOB=$JOB,AUTO_ALERT_IMPORT_REGION=$R"
echo "Rollback: gcloud run services update $SERVICE --project=$P --region=$R --update-env-vars=AUTO_ALERT_IMPORT_ENABLED=false"
