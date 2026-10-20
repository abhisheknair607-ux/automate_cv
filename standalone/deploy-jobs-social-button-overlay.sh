#!/usr/bin/env bash
# Overlay one Social link onto the EXACT live Jobs container image; no CV rebuild.
# Produces an isolated zero-traffic preview and promotes ONLY after bytewise proof.
set -euo pipefail
PROJECT=abhishek-cv-automation
REGION=europe-west1
SERVICE=automate-cv-dashboard
REPOSITORY=cloud-run-source-deploy
[[ "$(printenv GARAMAAL_JOBS_LINK_CONFIRM || true)" == "LINK_ONLY_FROM_LIVE_IMAGE" ]] || { echo 'SAFE STOP: explicit link-only approval missing'; exit 2; }
for bin in gcloud git python3 curl node; do command -v "$bin" >/dev/null || { echo "SAFE STOP: missing $bin"; exit 2; }; done
BASE="$(cd "$(dirname "$0")/.." && pwd)"
[[ -z "$(git -C "$BASE" status --porcelain)" ]] || { echo 'SAFE STOP: dirty source tree'; exit 2; }
TEMP="$(mktemp -d)"
trap 'rm -rf "$TEMP"' EXIT
chmod 700 "$TEMP"
gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format=json > "$TEMP/before.json"
OLD_REV="$(python3 - "$TEMP/before.json" <<'PY'
import json,sys
x=json.load(open(sys.argv[1]))
active=[t for t in x['status']['traffic'] if t.get('percent',0)>0]
assert len(active)==1 and active[0]['percent']==100 and active[0].get('revisionName'), 'SAFE STOP: nonstandard Jobs traffic distribution'
print(active[0]['revisionName'])
PY
)"
gcloud run revisions describe "$OLD_REV" --project="$PROJECT" --region="$REGION" --format=json > "$TEMP/old-revision.json"
BASE_IMAGE="$(python3 - "$TEMP/old-revision.json" <<'PY'
import json,re,sys
x=json.load(open(sys.argv[1]))
containers=x.get('spec',{}).get('containers',[])
assert len(containers)==1,'SAFE STOP: Jobs is not a single-container service'
url=containers[0].get('image','')
digest=x.get('status',{}).get('imageDigest','')
if re.search(r'@sha256:[0-9a-f]{64}$',digest):
 result=digest
elif re.search(r'@sha256:[0-9a-f]{64}$',url):
 result=url
elif re.fullmatch(r'sha256:[0-9a-f]{64}',digest) and url:
 result=url.split('@')[0].rsplit(':',1)[0]+'@'+digest
else:
 raise SystemExit('SAFE STOP: immutable live Jobs image digest not available')
print(result)
PY
)"
echo "LIVE_JOBS_REVISION: $OLD_REV"
echo "Only layering one HTML link onto the currently deployed immutable image."
gcloud artifacts repositories describe "$REPOSITORY" --project="$PROJECT" --location="$REGION" >/dev/null || { echo 'SAFE STOP: existing Artifact Registry repository missing'; exit 2; }
# No repository Jobs sources are copied. Node modifies ONLY /app/webapp/Index.html.
cat >"$TEMP/Dockerfile" <<'EOF'
FROM __IMMUTABLE_BASE_IMAGE__
USER root
RUN node -e 'const fs=require("node:fs");const f="/app/webapp/Index.html";const s=fs.readFileSync(f,"utf8");const a="<button class=\"btn btn-primary\" data-action=\"nav\" data-value=\"add\">";const start=s.indexOf("function dash(){");const p=s.indexOf(a,start);const end=s.indexOf("\nfunction ",start);if(start<0||p<0||(end>=0&&p>end)||s.includes("Open Social Networking Hub")){console.error("SAFE STOP: Jobs HTML does not match the approved one-link anchor");process.exit(3)}const l="<a href=\"/social\" class=\"btn\" aria-label=\"Open Social Networking Hub\" title=\"Networking Hub\">👥 Social</a>";fs.writeFileSync(f,s.slice(0,p)+l+s.slice(p));'
USER node
EOF
BASE_IMAGE="$BASE_IMAGE" python3 - "$TEMP/Dockerfile" <<'PY'
import os,sys
p=sys.argv[1]
s=open(p).read()
assert s.count('__IMMUTABLE_BASE_IMAGE__')==1
s=s.replace('__IMMUTABLE_BASE_IMAGE__',os.environ['BASE_IMAGE'])
open(p,'w').write(s)
PY
TAG="$REGION-docker.pkg.dev/$PROJECT/$REPOSITORY/jobs-social-link-only:$(date -u +%Y%m%d%H%M%S)"
gcloud builds submit "$TEMP" --project="$PROJECT" --region="$REGION" --tag="$TAG" --quiet
echo "Creating 0%-traffic Jobs preview. No production traffic is changed."
gcloud run deploy "$SERVICE" --project="$PROJECT" --region="$REGION" --image="$TAG" \
 --no-traffic --tag social-link-preview --quiet
gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format=json > "$TEMP/after-preview.json"
python3 - "$TEMP/before.json" "$TEMP/after-preview.json" "$OLD_REV" <<'PY'
import json,sys
old,new=[json.load(open(f)) for f in sys.argv[1:3]]
def config(o):
 s=o['spec']['template']['spec']
 c=s['containers'][0]
 return (s.get('serviceAccountName'),c.get('env'),c.get('resources'),c.get('ports'))
assert config(old)==config(new), 'SAFE STOP: runtime account, env, resources or ports changed'
assert any(t.get('revisionName')==sys.argv[3] and t.get('percent')==100 for t in new['status']['traffic']), 'SAFE STOP: Jobs production traffic moved'
print('JOBS_CONFIG_AND_TRAFFIC_PRESERVED')
PY
PREVIEW_URL="$(python3 - "$TEMP/after-preview.json" <<'PY'
import json,sys
x=json.load(open(sys.argv[1]))
p=[a for a in x['status']['traffic'] if a.get('tag')=='social-link-preview' and a.get('url')]
assert len(p)==1 and p[0].get('percent',0)==0, 'SAFE STOP: not a 0% preview'
print(p[0]['url'])
PY
)"
PREVIEW_REV="$(python3 - "$TEMP/after-preview.json" <<'PY'
import json,sys
x=json.load(open(sys.argv[1]))
print(next(t['revisionName'] for t in x['status']['traffic'] if t.get('tag')=='social-link-preview'))
PY
)"
curl -fsS --max-time 30 https://garamaal.web.app/ >"$TEMP/live.html"
curl -fsS --max-time 30 "$PREVIEW_URL/" >"$TEMP/preview.html"
python3 - "$TEMP/live.html" "$TEMP/preview.html" <<'PY'
import sys
old,new=[open(p,'rb').read() for p in sys.argv[1:]]
link=b'<a href="/social" class="btn" aria-label="Open Social Networking Hub" title="Networking Hub">'+bytes.fromhex('f09f91a5')+b' Social</a>'
assert old.count(link)==0,'SAFE STOP: Social button already on live Jobs'
assert new.count(link)==1,'SAFE STOP: expected exactly one link in preview'
assert new.replace(link,b'',1)==old,'SAFE STOP: Jobs preview changed beyond the single Social button'
print('JOBS_ONE_LINK_BYTEWISE_VERIFIED')
PY
curl -fsS --max-time 25 "$PREVIEW_URL/health" >"$TEMP/preview-health.json"
python3 - "$TEMP/preview-health.json" <<'PY'
import sys,json
x=json.load(open(sys.argv[1]))
assert x.get('ok') is True, 'SAFE STOP: Jobs preview health failed'
print('JOBS_PREVIEW_HEALTH_OK')
PY
echo "PREVIEW_VERIFIED: $PREVIEW_URL"
if [[ "$(printenv GARAMAAL_JOBS_LINK_PROMOTE || true)" != "YES_AFTER_BYTEWISE_CHECK" ]]; then
 echo 'PRODUCTION_JOBS_UNCHANGED: rerun with GARAMAAL_JOBS_LINK_PROMOTE=YES_AFTER_BYTEWISE_CHECK after approval'
 exit 0
fi
gcloud run services update-traffic "$SERVICE" --project="$PROJECT" --region="$REGION" --to-revisions="$PREVIEW_REV=100" --quiet
curl -fsS --max-time 30 https://garamaal.web.app/ >"$TEMP/live-after.html"
python3 - "$TEMP/live-after.html" "$TEMP/preview.html" <<'PY'
import sys
live,preview=[open(p,'rb').read() for p in sys.argv[1:]]
assert live==preview, 'ALERT: live Jobs HTML differs from validated one-link preview'
print('JOBS_SOCIAL_LINK_LIVE_OK')
PY
echo "PREVIOUS_JOBS_REVISION=$OLD_REV"
echo "ROLLBACK: gcloud run services update-traffic $SERVICE --project=$PROJECT --region=$REGION --to-revisions=$OLD_REV=100"
