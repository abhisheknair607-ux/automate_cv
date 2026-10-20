#!/usr/bin/env bash
# Safely add ONLY shared header HTML/CSS and passive local-typing indicator
# on top of the immutable currently serving Jobs image. Never rebuild from
# repository Jobs code, change Social, change Firebase Hosting, or promote.
set -euo pipefail
PROJECT=abhishek-cv-automation
REGION=europe-west1
JOBS=automate-cv-dashboard
SOCIAL=automate-cv-social
[[ "${JOBS_HEADER_PREVIEW_CONFIRM:-}" == "LIVE_JOBS_IMAGE_UI_ONLY" ]] || {
  echo "SAFE STOP: set JOBS_HEADER_PREVIEW_CONFIRM=LIVE_JOBS_IMAGE_UI_ONLY";exit 2;
}
for exe in gcloud git node python3 curl; do command -v "$exe" >/dev/null || {
  echo "SAFE STOP: missing $exe"; exit 2;
};done
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
[[ -z "$(git -C "$ROOT" status --porcelain)" ]] || {
  echo "SAFE STOP: checkout has local changes";exit 2;
}
[[ -f "$ROOT/standalone/maintenance/jobs_header_patch.cjs" ]] || { echo "SAFE STOP: missing overlay script";exit 2; }
TMP="$(mktemp -d)"
chmod 700 "$TMP"
trap 'rm -rf "$TMP"' EXIT
gcloud run services describe "$JOBS" --project="$PROJECT" --region="$REGION" --format=json >"$TMP/jobs-before.json"
gcloud run services describe "$SOCIAL" --project="$PROJECT" --region="$REGION" --format=json >"$TMP/social-before.json"
OLD_REV="$(python3 - "$TMP/jobs-before.json" <<'PY'
import json,sys
x=json.load(open(sys.argv[1]))
full=[t for t in x["status"].get("traffic",[]) if t.get("percent",0)==100]
assert len(full)==1,"SAFE STOP: Jobs must have exactly one live 100% revision"
assert len(x["spec"]["template"]["spec"]["containers"])==1,"SAFE STOP: multiple Jobs containers"
print(full[0]["revisionName"])
PY
)"
gcloud run revisions describe "$OLD_REV" --project="$PROJECT" --region="$REGION" --format=json >"$TMP/jobs-live-revision.json"
LIVE_IMAGE="$(python3 - "$TMP/jobs-live-revision.json" <<'PY'
import json,sys,re
x=json.load(open(sys.argv[1]))
candidates=[x.get("status",{}).get("imageDigest","")]
candidates += [z.get("imageDigest","") for z in x.get("status",{}).get("containerStatuses",[])]
candidates += [z.get("image","") for z in x.get("spec",{}).get("containers",[])]
pins=[v for v in candidates if re.fullmatch(r"[A-Za-z0-9._:/-]+@sha256:[a-fA-F0-9]{64}",v)]
assert pins,"SAFE STOP: could not identify an immutable digest of the LIVE Jobs image"
print(pins[0])
PY
)"
echo "JOBS_LIVE_REVISION: $OLD_REV"
echo "BASE_IMAGE_PINNED: the EXACT live digest will be used; no GitHub Jobs code will be copied"
mkdir -p "$TMP/build"
cp "$ROOT/standalone/maintenance/jobs_header_patch.cjs" "$TMP/build/jobs_header_patch.cjs"
{
  printf 'FROM %s AS running_jobs\n' "$LIVE_IMAGE"
  printf 'FROM node:22-bookworm-slim AS patcher\n'
  printf 'COPY --from=running_jobs /app/webapp/Index.html /work/Index.html\n'
  printf 'COPY jobs_header_patch.cjs /work/jobs_header_patch.cjs\n'
  printf 'RUN node /work/jobs_header_patch.cjs /work/Index.html\n'
  printf 'FROM %s\n' "$LIVE_IMAGE"
  printf 'COPY --from=patcher /work/Index.html /app/webapp/Index.html\n'
} >"$TMP/build/Dockerfile"
# Only the one dashboard HTML is copied from the patch stage. Every other
# filesystem layer, entrypoint, runtime command and service environment is live-image identical.
SA="$(python3 - "$TMP/jobs-before.json" <<'PY'
import json,sys
x=json.load(open(sys.argv[1]))
print(x["spec"]["template"]["spec"].get("serviceAccountName",""))
PY
)"
[[ "$SA" == *.gserviceaccount.com ]] || { echo "SAFE STOP: Jobs service account unexpected";exit 2; }
echo "Deploying 0%-traffic Jobs UI preview based on running image (NOT production)"
gcloud run deploy "$JOBS" --project="$PROJECT" --region="$REGION" \
 --source="$TMP/build" --no-traffic --tag jobs-header-preview \
 --service-account="$SA" --quiet
gcloud run services describe "$JOBS" --project="$PROJECT" --region="$REGION" --format=json >"$TMP/jobs-after.json"
gcloud run services describe "$SOCIAL" --project="$PROJECT" --region="$REGION" --format=json >"$TMP/social-after.json"
PREVIEW_URL="$(python3 - "$TMP/jobs-before.json" "$TMP/jobs-after.json" "$TMP/social-before.json" "$TMP/social-after.json" "$OLD_REV" <<'PY'
import json,sys
jb,ja,sb,sa=[json.load(open(p)) for p in sys.argv[1:5]]
oldrev=sys.argv[5]
def config(o):
 spec=o["spec"]["template"]["spec"]
 c=spec["containers"][0]
 return (spec.get("serviceAccountName"),spec.get("containerConcurrency"),
         spec.get("timeoutSeconds"),spec.get("maxScale"),
         c.get("env"),c.get("resources"),c.get("ports"),c.get("command"),c.get("args"))
assert config(jb)==config(ja),"SAFE STOP: Jobs runtime configuration changed during build"
assert any(x.get("percent",0)==100 and x.get("revisionName")==oldrev for x in ja["status"]["traffic"]), "SAFE STOP: Jobs production traffic changed"
preview=[x for x in ja["status"]["traffic"] if x.get("tag")=="jobs-header-preview"]
assert len(preview)==1 and preview[0].get("percent",0)==0 and preview[0].get("url"),"SAFE STOP: Jobs preview is not a 0% tagged revision"
assert (sb["status"]["traffic"],sb["status"].get("latestReadyRevisionName"))==(sa["status"]["traffic"],sa["status"].get("latestReadyRevisionName")),"SAFE STOP: Social changed"
print("JOBS_PRODUCTION_UNCHANGED: old live image still serves 100% traffic",file=sys.stderr)
print("SOCIAL_UNCHANGED_VERIFIED",file=sys.stderr)
print(preview[0]["url"])
PY
)"
curl -fsS --max-time 30 "$PREVIEW_URL/" >"$TMP/jobs-preview.html"
curl -fsS --max-time 30 "$PREVIEW_URL/health" >"$TMP/jobs-preview-health.json"
URL="$(python3 - "$TMP/jobs-before.json" <<'PY'
import json,sys
print(json.load(open(sys.argv[1]))["status"]["url"])
PY
)"
curl -fsS --max-time 30 "$URL/health" >"$TMP/jobs-live-health.json"
python3 - "$TMP/jobs-preview.html" "$TMP/jobs-live-health.json" "$TMP/jobs-preview-health.json" <<'PY'
import re,sys,json
html=open(sys.argv[1]).read()
live=json.load(open(sys.argv[2]))
canary=json.load(open(sys.argv[3]))
assert live==canary,"SAFE STOP: Jobs health response changed"
m=re.search(r'<header class="topbar garamaal-unified-header">.*?</header>',html,re.S)
assert m,"SAFE STOP: Jobs preview missing unified header"
for term in ['id="candidateToggle"','id="expenseToggle"','id="modeBadge"',
             'id="jobHeaderLink"','id="socialHeaderLink"','href="/social"',
             'data-garamaal-jobs-live-overlay']:
 assert term in html,"SAFE STOP: Jobs preview is missing "+term
print("JOBS_PREVIEW_HTML_AND_HEALTH_VERIFIED",file=sys.stderr)
PY
for file in bridge.js dashboard-ranking.js dashboard-connections.js; do
 curl -fsS --max-time 30 "$URL/$file" >"$TMP/live-$file"
 curl -fsS --max-time 30 "$PREVIEW_URL/$file" >"$TMP/preview-$file"
 cmp "$TMP/live-$file" "$TMP/preview-$file" || { echo "SAFE STOP: original Jobs JS changed: $file";exit 5; }
done
echo "JOBS_EXISTING_JS_UNCHANGED_VERIFIED"
echo "JOBS_HEADER_PREVIEW_VERIFIED: $PREVIEW_URL/"
echo "SAFE COMPLETE: production Jobs and Social untouched. Review preview BEFORE any traffic promotion."
