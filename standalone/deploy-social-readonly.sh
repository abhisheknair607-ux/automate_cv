#!/usr/bin/env bash
# Deploy NEW Social Cloud Run service only, in read-only mode.
# NEVER deploy/update/change traffic on automate-cv-dashboard (Jobs).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT=abhishek-cv-automation
REGION=europe-west1
JOBS=automate-cv-dashboard
REV=automate-cv-dashboard-00027-rrv
IMAGE_SHA=153c09ef575d89e93923956be0bdd2fe42f843047a93cf3d0d90b5ebe7b644f0
SOCIAL=automate-cv-social
FRESH=1ltT1gPFcpBdz1Wp_CuxkwFpfkwnnhjL316yVu3gxPCc

if [[ "${GARAMAAL_SOCIAL_CONFIRM:-}" != "DEPLOY_SOCIAL_READONLY" ]]; then
  echo "SAFE STOP: run with GARAMAAL_SOCIAL_CONFIRM=DEPLOY_SOCIAL_READONLY"
  exit 2
fi
for name in gcloud python3 git curl; do command -v "$name" >/dev/null || exit 2; done
for name in package.json Dockerfile.social standalone/social_server.js standalone/social_store.js standalone/social.html standalone/bridge.js; do
  [[ -f "$ROOT/$name" ]] || { echo "Missing $name"; exit 2; }
done
[[ -z "$(git -C "$ROOT" status --porcelain)" ]] || { echo "SAFE STOP: uncommitted changes"; exit 2; }

verify_jobs() {
  local actual digest
  actual="$(gcloud run services describe "$JOBS" --project="$PROJECT" --region="$REGION" --format='value(status.latestReadyRevisionName)')"
  [[ "$actual" == "$REV" ]] || { echo "SAFE STOP: Jobs revision changed"; exit 3; }
  digest="$(gcloud run revisions describe "$REV" --project="$PROJECT" --region="$REGION" --format='value(status.imageDigest)')"
  [[ "$digest" == *"$IMAGE_SHA" ]] || { echo "SAFE STOP: Jobs image changed"; exit 3; }
  gcloud run services describe "$JOBS" --project="$PROJECT" --region="$REGION" --format=json |
  python3 -c '
import json,sys
t=json.load(sys.stdin).get("status",{}).get("traffic",[])
assert len(t)==1 and t[0].get("revisionName")=="automate-cv-dashboard-00027-rrv" and int(t[0].get("percent",0))==100,"Jobs traffic changed"
'
}
verify_jobs
echo "JOBS_BASELINE_OK: $REV / 100% traffic"

BUILD="$(mktemp -d)"
trap 'rm -rf "$BUILD"' EXIT
chmod 700 "$BUILD"
mkdir -p "$BUILD/standalone"
cp "$ROOT/package.json" "$BUILD/"
cp "$ROOT/Dockerfile.social" "$BUILD/Dockerfile"
for name in social_server.js social_store.js social.html bridge.js; do
  cp "$ROOT/standalone/$name" "$BUILD/standalone/"
done
SA="$(gcloud run services describe "$JOBS" --project="$PROJECT" --region="$REGION" --format='value(spec.template.spec.serviceAccountName)')"
[[ "$SA" == *@*.iam.gserviceaccount.com ]] || { echo "SAFE STOP: unable to determine runtime identity"; exit 4; }
export PROJECT FRESH
export RELEASE_SHA="$(git -C "$ROOT" rev-parse HEAD)"
# Reuse the already authorised Sheets-capable runtime identity for this
# READ-ONLY trial. Never echo account allowlists or copy Jobs secrets.
gcloud run services describe "$JOBS" --project="$PROJECT" --region="$REGION" --format=json |
 python3 -c '
import json,os,sys
x=json.load(sys.stdin)["spec"]["template"]["spec"]["containers"][0].get("env",[])
v=next((e.get("value","") for e in x if e.get("name")=="ALLOWED_EMAILS"),"")
assert v and "@" in v,"SAFE STOP: allowed Google accounts missing; do not guess"
d={"GOOGLE_CLOUD_PROJECT":os.environ["PROJECT"],
"FRESHMAL_SPREADSHEET_ID":os.environ["FRESH"],
"ALLOWED_EMAILS":v,
"SOCIAL_READ_ONLY":"true",
"SOCIAL_ALLOW_LIVE_WRITES":"false",
"SOCIAL_GIT_SHA":os.environ["RELEASE_SHA"]}
for k,val in d.items():print(k+": "+json.dumps(val))
' > "$BUILD/env.yaml"
chmod 600 "$BUILD/env.yaml"
echo "Deploying NEW $SOCIAL only (read-only)..."
gcloud run deploy "$SOCIAL" --source="$BUILD" --project="$PROJECT" --region="$REGION" \
  --service-account="$SA" --env-vars-file="$BUILD/env.yaml" \
  --min-instances=0 --max-instances=1 --allow-unauthenticated --quiet
URL="$(gcloud run services describe "$SOCIAL" --project="$PROJECT" --region="$REGION" --format='value(status.url)')"
[[ "$URL" == https://* ]] || { echo "New Social URL unavailable"; exit 5; }
curl -fsS --retry 5 --retry-delay 3 "$URL/health" |
 python3 -c '
import json,sys
x=json.load(sys.stdin)
assert x["ok"] is True and x["service"]=="garamaal-social" and x["readOnly"] is True
assert len(x["release"])==40
print("SOCIAL_HEALTH_OK: read-only, release",x["release"])
'
curl -fsS "$URL/social" -o /dev/null
for path in / /api/listJobs /api/getCvQueue /api/download; do
  code="$(curl -sS -o /dev/null -w '%{http_code}' "$URL$path")"
  [[ "$code" == 404 ]] || { echo "FAIL: Jobs path exposed: $path ($code)"; exit 5; }
done
code="$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
  -H 'Content-Type: application/json' -d '{"candidate":"Abhishek"}' "$URL/api/social/data")"
[[ "$code" == 401 ]] || { echo "FAIL: unauthenticated Social API ($code)"; exit 5; }
verify_jobs
echo "SOCIAL_READONLY_DEPLOYED: $URL"
echo "JOBS_UNCHANGED: $REV / 100% traffic"
echo "NEXT: Firebase Hosting preview; this script does not update the live domain."
