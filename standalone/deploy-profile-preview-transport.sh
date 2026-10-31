#!/usr/bin/env bash
# Isolated Garamaal Profile browser transport test. NEVER deploys to production.
# Creates a 0%-traffic tagged revision on garamaal-profile-staging.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="abhishek-cv-automation"
REGION="europe-west1"
SERVICE="garamaal-profile-staging"
IDENTITY="garamaal-profile-staging@$PROJECT.iam.gserviceaccount.com"
TAG="profile-authfix"

[[ -f "$ROOT/Dockerfile.garamaal-ui" && -f "$ROOT/standalone/server.js" ]] || {
  echo "STOP: missing checked-out staging source." >&2; exit 2;
}
[[ "$(git -C "$ROOT" branch --show-current)" == "feature/activate-garamaal-profile-20261031" ]] || {
  echo "STOP: only the approved Profile development branch is allowed." >&2; exit 2;
}
grep -Fq 'COPY --chown=node:node standalone ./standalone' "$ROOT/Dockerfile.garamaal-ui"
grep -Fq 'X-Garamaal-Firebase-Authorization' "$ROOT/standalone/bridge.js"

umask 077
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format=json > "$TMP/current.json"
python3 - "$TMP/current.json" "$IDENTITY" <<'PY'
import json,sys
s=json.load(open(sys.argv[1],encoding="utf-8"))
t=s.get("spec",{}).get("template",{}).get("spec")
if t is None:t=s.get("template",{})
if (t.get("serviceAccountName") or t.get("serviceAccount"))!=sys.argv[2]:
 raise SystemExit("STOP: profile staging is not using its dedicated identity")
c=t.get("containers",[])
if len(c)!=1:raise SystemExit("STOP: unexpected container layout")
e={x["name"]:x.get("value") for x in c[0].get("env",[])}
for name,value in {
 "APP_READ_ONLY":"true",
 "GARAMAAL_PROFILE_ENABLED":"true",
 "GARAMAAL_PROFILE_WRITES_APPROVED":"false",
 "GARAMAAL_PROFILE_STAGING_ISOLATED":"true",
 "GARAMAAL_PROFILE_PRODUCTION_APPROVED":"false",
 "GARAMAAL_PROFILE_DATA_SCOPE":"staging",
}.items():
 if e.get(name)!=value:raise SystemExit("STOP: unsafe or missing staging setting: "+name)
for name in ["FIREBASE_WEB_API_KEY","FIREBASE_WEB_APP_ID",
             "ALLOWED_EMAILS","GARAMAAL_PROFILE_CANDIDATE_ACL_JSON",
             "MASTER_EVIDENCE_BANK_FILE_ID","SUMMARY_DOC_FILE_ID",
             "POOJA_MASTER_EVIDENCE_BANK_FILE_ID","POOJA_SUMMARY_DOC_FILE_ID"]:
 if not e.get(name):raise SystemExit("STOP: missing source/auth setting: "+name)
print("Isolated staging identity and read-only protection: PASS")
PY

mkdir "$TMP/build"
cp "$ROOT/Dockerfile.garamaal-ui" "$TMP/build/Dockerfile"
cp "$ROOT/package.json" "$TMP/build/"
cp -R "$ROOT/standalone" "$TMP/build/"
cp -R "$ROOT/garamaal-release-webapp" "$TMP/build/"

echo "Deploying read-only Profile fix as a 0%-traffic tagged STAGING revision..."
gcloud run deploy "$SERVICE" --source="$TMP/build"  --project="$PROJECT" --region="$REGION"  --service-account="$IDENTITY"  --no-traffic --tag="$TAG"  --no-allow-unauthenticated --quiet

gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION"  --format="table(status.latestCreatedRevisionName,status.latestReadyRevisionName)"
echo "To test new revision (separate Cloud Shell terminal, old proxy stopped):"
echo "gcloud run services proxy $SERVICE --project=$PROJECT --region=$REGION --tag=$TAG --port=8080"
echo "Staging only. Production services and production traffic were NOT targeted."
