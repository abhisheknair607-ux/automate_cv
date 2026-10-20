#!/usr/bin/env bash
# Deploy only the isolated Garamaal Social Cloud Run service; never touch Jobs or Hosting.
set -euo pipefail
PROJECT=abhishek-cv-automation
REGION=europe-west1
JOBS=automate-cv-dashboard
SOCIAL=automate-cv-social
BASE_SHA=36182fbbd16a14309a5a87b67bc8a443d93fc14e
[[ "$(printenv GARAMAAL_SOCIAL_CONFIRM || true)" == 'DEPLOY_SOCIAL_ONLY_READONLY' ]] || { echo 'SAFE STOP: confirm DEPLOY_SOCIAL_ONLY_READONLY'; exit 2; }
for bin in gcloud git python3 curl; do command -v "$bin" >/dev/null || { echo "Missing $bin"; exit 2; }; done
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[[ -z "$(git -C "$ROOT" status --porcelain)" ]] || { echo 'SAFE STOP: dirty tree'; exit 2; }
git -C "$ROOT" merge-base --is-ancestor "$BASE_SHA" HEAD || { echo 'SAFE STOP: required Social release not present'; exit 2; }
SHA="$(git -C "$ROOT" rev-parse HEAD)"
A_FOLDER="$(printenv SOCIAL_INBOX_ABHISHEK_FOLDER_ID || true)"
P_FOLDER="$(printenv SOCIAL_INBOX_POOJA_FOLDER_ID || true)"
[[ "$A_FOLDER" =~ ^[A-Za-z0-9_-]{20,}$ && "$P_FOLDER" =~ ^[A-Za-z0-9_-]{20,}$ && "$A_FOLDER" != "$P_FOLDER" ]] || { echo 'SAFE STOP: set distinct A/P Drive folder IDs'; exit 2; }
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
chmod 700 "$TMP"
gcloud run services describe "$JOBS" --project="$PROJECT" --region="$REGION" --format=json > "$TMP/jobs-before.json"
gcloud run services describe "$SOCIAL" --project="$PROJECT" --region="$REGION" --format=json > "$TMP/social-before.json"
SA="$(python3 - "$TMP/social-before.json" <<'PY'
import json,sys
x=json.load(open(sys.argv[1]))
s=x['spec']['template']['spec']
sa=s.get('serviceAccountName','')
assert sa.endswith('.gserviceaccount.com'), 'Social runtime service account not verified'
c=s.get('containers',[])
assert len(c)==1, 'Unexpected Social container configuration'
env={e['name']:e.get('value','') for e in c[0].get('env',[]) if 'name' in e}
assert not (env.get('SOCIAL_READ_ONLY')=='false' and env.get('SOCIAL_ALLOW_LIVE_WRITES')=='true'), 'SAFE STOP: Social is already write-enabled'
print(sa)
PY
)"
echo "Using existing Social identity: $SA"
echo 'Important: share both private A/P Research Inbox Drive folders with this exact service account before enabling writes.'
mkdir -p "$TMP/build/standalone"
cp "$ROOT/package.json" "$TMP/build/package.json"
cp "$ROOT/Dockerfile.social" "$TMP/build/Dockerfile"
for file in social_server.js social_store.js social_research.js social.html bridge.js; do
  cp "$ROOT/standalone/$file" "$TMP/build/standalone/$file"
done
# --update-env-vars retains unrelated existing environment. Keep the write gate closed.
gcloud run deploy "$SOCIAL" --source="$TMP/build" --project="$PROJECT" --region="$REGION" --service-account="$SA" \
  --update-env-vars="SOCIAL_GIT_SHA=$SHA,SOCIAL_READ_ONLY=true,SOCIAL_ALLOW_LIVE_WRITES=false,SOCIAL_INBOX_ABHISHEK_FOLDER_ID=$A_FOLDER,SOCIAL_INBOX_POOJA_FOLDER_ID=$P_FOLDER" --quiet
gcloud run services describe "$JOBS" --project="$PROJECT" --region="$REGION" --format=json > "$TMP/jobs-after.json"
python3 - "$TMP/jobs-before.json" "$TMP/jobs-after.json" <<'PY'
import json,sys
before,after=[json.load(open(p)) for p in sys.argv[1:]]
def fingerprint(x):
 s=x['status']
 return s.get('latestReadyRevisionName'),s.get('traffic')
assert fingerprint(before)==fingerprint(after), 'ALERT: Jobs revision/traffic changed'
print('JOBS_UNCHANGED: revision and traffic match preflight')
PY
URL="$(gcloud run services describe "$SOCIAL" --project="$PROJECT" --region="$REGION" --format='value(status.url)')"
[[ "$URL" == https://* ]] || { echo 'Social URL missing'; exit 5; }
curl --fail --silent --show-error --max-time 25 "$URL/health" > "$TMP/health.json"
python3 - "$TMP/health.json" "$SHA" <<'PY'
import json,sys
x=json.load(open(sys.argv[1]))
assert x.get('ok') and x.get('service')=='garamaal-social', 'Wrong service'
assert x.get('readOnly') is True, 'Social not read-only'
assert x.get('release')==sys.argv[2], 'Release SHA mismatch'
print('SOCIAL_HEALTH_OK: expected release, read-only')
PY
for route in /social /social/bridge.js; do
  [[ "$(curl -sS --max-time 20 -o /dev/null -w '%{http_code}' "$URL$route")" == 200 ]] || { echo "Social missing: $route"; exit 5; }
done
for route in / /api/listJobs /api/download; do
  [[ "$(curl -sS --max-time 20 -o /dev/null -w '%{http_code}' "$URL$route")" == 404 ]] || { echo "Unexpected Jobs endpoint in Social: $route"; exit 5; }
done
[[ "$(curl -sS --max-time 20 -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{"candidate":"Abhishek"}' "$URL/api/social/data")" == 401 ]] || { echo 'Social unauthenticated API gate failed'; exit 5; }
echo "SOCIAL_RELEASE_OK: $URL/social"
echo 'NEXT: verify https://garamaal.web.app/social using authorised Google sign-in.'
echo 'NEXT: stage Sheets/Drive write tests before enabling Social writes separately.'
