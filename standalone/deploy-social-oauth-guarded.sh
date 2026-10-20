#!/usr/bin/env bash
# Update ONLY the already-editable Social Hub with owner Google Drive OAuth support via a 0%-traffic canary.
# Never deploy Jobs, alter Firebase Hosting, edit a Sheet directly, or run paid AI jobs.
set -euo pipefail
PROJECT=abhishek-cv-automation
REGION=europe-west1
SOCIAL=automate-cv-social
JOBS=automate-cv-dashboard
[[ "${GARAMAAL_SOCIAL_OAUTH_CONFIRM:-}" == "SOCIAL_ONLY_OWNER_OAUTH" ]] || { echo 'SAFE STOP: set GARAMAAL_SOCIAL_OAUTH_CONFIRM=SOCIAL_ONLY_OWNER_OAUTH'; exit 2; }
for bin in git gcloud python3 curl; do command -v "$bin" >/dev/null || { echo "SAFE STOP: missing $bin"; exit 2; }; done
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[[ -z "$(git -C "$ROOT" status --porcelain)" ]] || { echo 'SAFE STOP: source checkout has uncommitted changes'; exit 2; }
grep -q 'function savedTargetRows(query)' "$ROOT/standalone/social.html" || { echo 'SAFE STOP: Research UI missing'; exit 2; }
grep -q 'auth.signInWithPopup(provider)' "$ROOT/standalone/social.html" || { echo 'SAFE STOP: owner OAuth popup missing'; exit 2; }
grep -q 'delegatedDriveToken(payload,sessionEmail)' "$ROOT/standalone/social_server.js" || { echo 'SAFE STOP: owner credential verification missing'; exit 2; }
grep -q 'app.get("/config"' "$ROOT/standalone/social_server.js" || { echo 'SAFE STOP: Social preview Firebase config route missing'; exit 2; }
SHA="$(git -C "$ROOT" rev-parse HEAD)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
chmod 700 "$TMP"
gcloud run services describe "$SOCIAL" --project="$PROJECT" --region="$REGION" --format=json >"$TMP/social-before.json"
gcloud run services describe "$JOBS" --project="$PROJECT" --region="$REGION" --format=json >"$TMP/jobs-before.json"
python3 - "$TMP/social-before.json" <<'PY'
import json,re,sys
x=json.load(open(sys.argv[1]))
spec=x['spec']['template']['spec']
assert spec.get('serviceAccountName','').endswith('.gserviceaccount.com'),'SAFE STOP: Social identity unknown'
assert len(spec.get('containers',[]))==1,'SAFE STOP: unexpected Social container topology'
env={i['name']:i.get('value','') for i in spec['containers'][0].get('env',[])}
assert env.get('SOCIAL_READ_ONLY')=='false' and env.get('SOCIAL_ALLOW_LIVE_WRITES')=='true','SAFE STOP: expected an existing editable Social service; no other configuration will be changed'
assert env.get('FRESHMAL_SPREADSHEET_ID','') and re.fullmatch(r'[A-Za-z0-9_-]{20,}',env['FRESHMAL_SPREADSHEET_ID']),'SAFE STOP: Social spreadsheet not configured'
assert env.get('ALLOWED_EMAILS','').strip(),'SAFE STOP: Social authorised email allowlist missing'
a=env.get('SOCIAL_INBOX_ABHISHEK_FOLDER_ID','')
p=env.get('SOCIAL_INBOX_POOJA_FOLDER_ID','')
assert a!=p and re.fullmatch(r'[A-Za-z0-9_-]{20,}',a) and re.fullmatch(r'[A-Za-z0-9_-]{20,}',p),'SAFE STOP: separate Research Drive folders missing'
t=[z for z in x['status'].get('traffic',[]) if z.get('percent',0)>0]
assert len(t)==1 and t[0].get('percent')==100,'SAFE STOP: unexpected active Social traffic distribution'
print('SOCIAL_PREFLIGHT_OK: auth, existing storage IDs, isolated service and write gate verified')
print('LIVE_SOCIAL_RELEASE: '+env.get('SOCIAL_GIT_SHA','unlabelled'))
PY
SA="$(python3 - "$TMP/social-before.json" <<'PY'
import json,sys
print(json.load(open(sys.argv[1]))['spec']['template']['spec']['serviceAccountName'])
PY
)"
OLD_REV="$(python3 - "$TMP/social-before.json" <<'PY'
import json,sys
x=json.load(open(sys.argv[1]))
print(next(t['revisionName'] for t in x['status']['traffic'] if t.get('percent',0)==100))
PY
)"
mkdir -p "$TMP/build/standalone"
cp "$ROOT/package.json" "$TMP/build/package.json"
cp "$ROOT/Dockerfile.social" "$TMP/build/Dockerfile"
for file in social_server.js social_store.js social_research.js social.html bridge.js; do cp "$ROOT/standalone/$file" "$TMP/build/standalone/$file"; done
echo 'Building isolated Social-only 0%-traffic owner OAuth canary; Jobs image is not built or deployed.'
gcloud run deploy "$SOCIAL" --project="$PROJECT" --region="$REGION" --source="$TMP/build" \
  --service-account="$SA" --no-traffic --tag social-oauth-preview \
  --update-env-vars="SOCIAL_GIT_SHA=$SHA" --quiet
gcloud run services describe "$SOCIAL" --project="$PROJECT" --region="$REGION" --format=json >"$TMP/social-preview.json"
gcloud run services describe "$JOBS" --project="$PROJECT" --region="$REGION" --format=json >"$TMP/jobs-after-preview.json"
python3 - "$TMP/social-before.json" "$TMP/social-preview.json" "$TMP/jobs-before.json" "$TMP/jobs-after-preview.json" "$OLD_REV" <<'PY'
import json,sys
old,new,jobs_before,jobs_after=[json.load(open(p)) for p in sys.argv[1:5]]
assert (jobs_before['status'].get('latestReadyRevisionName'),jobs_before['status']['traffic']) == (jobs_after['status'].get('latestReadyRevisionName'),jobs_after['status']['traffic']), 'SAFE STOP: Jobs revision/traffic changed'
def settings(x):
  s=x['spec']['template']['spec']
  c=s['containers'][0]
  env={e['name']:e.get('value','') for e in c.get('env',[])}
  return s.get('serviceAccountName'),c.get('resources'),c.get('ports'),env
old_sa,old_res,old_ports,old_env=settings(old)
new_sa,new_res,new_ports,new_env=settings(new)
assert (old_sa,old_res,old_ports)==(new_sa,new_res,new_ports),'SAFE STOP: Social service identity/resources/ports changed'
for name in ('SOCIAL_GIT_SHA',): old_env.pop(name,None);new_env.pop(name,None)
assert old_env==new_env,'SAFE STOP: unrelated Social configuration changed'
assert any(t.get('revisionName')==sys.argv[5] and t.get('percent',0)==100 for t in new['status']['traffic']),'SAFE STOP: Social live traffic moved during canary'
preview=[t for t in new['status']['traffic'] if t.get('tag')=='social-oauth-preview']
assert len(preview)==1 and preview[0].get('percent',0)==0 and preview[0].get('url'),'SAFE STOP: canary tag not at 0% traffic'
print('ISOLATION_OK: Jobs untouched; Social config preserved; canary receives 0% production traffic')
PY
PREVIEW_URL="$(python3 - "$TMP/social-preview.json" <<'PY'
import json,sys
x=json.load(open(sys.argv[1]))
print(next(t['url'] for t in x['status']['traffic'] if t.get('tag')=='social-oauth-preview'))
PY
)"
PREVIEW_REV="$(python3 - "$TMP/social-preview.json" <<'PY'
import json,sys
x=json.load(open(sys.argv[1]))
print(next(t['revisionName'] for t in x['status']['traffic'] if t.get('tag')=='social-oauth-preview'))
PY
)"
curl -fsS --max-time 25 "$PREVIEW_URL/health" >"$TMP/health.json"
python3 - "$TMP/health.json" "$SHA" <<'PY'
import json,sys
x=json.load(open(sys.argv[1]))
assert x.get('ok') is True and x.get('service')=='garamaal-social','SAFE STOP: wrong canary service'
assert x.get('readOnly') is False,'SAFE STOP: Social still read-only'
assert x.get('release')==sys.argv[2],'SAFE STOP: Social release SHA mismatch'
assert x.get('credentialsConfigured') is True,'SAFE STOP: Social auth credentials missing'
print('EDITABLE_CANARY_HEALTH_OK')
PY
curl -fsS --max-time 25 "$PREVIEW_URL/config" >"$TMP/public-firebase-config.json"
python3 - "$TMP/public-firebase-config.json" "$PROJECT" <<'PY'
import json,sys
x=json.load(open(sys.argv[1]))
assert set(x)=={'apiKey','authDomain','projectId','appId'},'SAFE STOP: unexpected or missing public Firebase keys'
assert x['projectId']==sys.argv[2] and all(x.values()),'SAFE STOP: Social sign-in config invalid'
print('SOCIAL_AUTH_CONFIG_OK: isolated Social preview can initialise the existing Firebase bridge')
PY
curl -fsS --max-time 25 "$PREVIEW_URL/social" >"$TMP/social.html"
grep -q 'function savedTargetRows(query)' "$TMP/social.html" || { echo 'SAFE STOP: Research UI missing from preview'; exit 5; }
grep -q 'auth.signInWithPopup(provider)' "$TMP/social.html" || { echo 'SAFE STOP: OAuth popup token flow missing from canary'; exit 5; }
grep -q 'USED_' "$TMP/social.html" || { echo 'SAFE STOP: processed-file prompt missing'; exit 5; }
curl -fsS --max-time 25 "$PREVIEW_URL/social/bridge.js" >/dev/null
for route in / /api/listJobs /api/download; do
  [[ "$(curl -sS --max-time 20 -o /dev/null -w '%{http_code}' "$PREVIEW_URL$route")" == 404 ]] || { echo "SAFE STOP: unexpected Jobs route $route"; exit 5; }
done
[[ "$(curl -sS --max-time 20 -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{"candidate":"Abhishek"}' "$PREVIEW_URL/api/social/data")" == 401 ]] || { echo 'SAFE STOP: unauthorised API was not blocked'; exit 5; }
echo "EDITABLE_PREVIEW_VERIFIED: $PREVIEW_URL/social"
if [[ "${GARAMAAL_SOCIAL_OAUTH_PROMOTE:-}" != "YES_AFTER_CANARY_CHECK" ]]; then
  echo 'SOCIAL_PRODUCTION_UNCHANGED: run authenticated owner Google Drive consent test in canary first, then use both confirmation flags to promote'
  exit 0
fi
gcloud run services update-traffic "$SOCIAL" --project="$PROJECT" --region="$REGION" --to-revisions="$PREVIEW_REV=100" --quiet
URL="$(gcloud run services describe "$SOCIAL" --project="$PROJECT" --region="$REGION" --format='value(status.url)')"
curl -fsS --max-time 25 "$URL/health" >"$TMP/live-health.json"
python3 - "$TMP/live-health.json" "$SHA" <<'PY'
import json,sys
x=json.load(open(sys.argv[1]))
assert x.get('service')=='garamaal-social' and x.get('readOnly') is False and x.get('release')==sys.argv[2], 'Social live release mismatch'
print('EDITABLE_SOCIAL_LIVE_OK')
PY
echo "ROLLBACK: gcloud run services update-traffic $SOCIAL --project=$PROJECT --region=$REGION --to-revisions=$OLD_REV=100"
echo 'NEXT: authorise owner Google Drive and smoke test screenshot/TXT/chat uploads, verified import and rename; compare Jobs after release.'
