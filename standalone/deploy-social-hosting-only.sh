#!/usr/bin/env bash
# Publish ONLY Firebase Hosting's Social rewrites. Never deploy Jobs Cloud Run.
set -euo pipefail
PROJECT=abhishek-cv-automation
REGION=europe-west1
REV=automate-cv-dashboard-00027-rrv
DIGEST=153c09ef575d89e93923956be0bdd2fe42f843047a93cf3d0d90b5ebe7b644f0
HASH=d870c5af112bb1da77426fbb1b5a7c6ec54a81d3f56e7500f7e2c745fd20b054
LIVE=https://garamaal.web.app
PREVIEW=https://garamaal--social-preview-gthohwx8.web.app
[[ "$(printenv GARAMAAL_SOCIAL_CONFIRM || true)" == "PUBLISH_SOCIAL_HOSTING_ONLY" ]] || {
  echo "SAFE STOP: confirm with GARAMAAL_SOCIAL_CONFIRM=PUBLISH_SOCIAL_HOSTING_ONLY"; exit 2;
}
for bin in gcloud firebase git python3; do command -v "$bin" >/dev/null || { echo "Missing $bin"; exit 2; }; done
cd "$(dirname "$0")/.."
[[ "$(git branch --show-current)" == "fix/firebase-garamaal-status-contacts-20261016" ]] || { echo "Wrong release branch"; exit 2; }
[[ -z "$(git status --porcelain)" ]] || { echo "Dirty working tree"; exit 2; }
python3 - <<'PY'
import json
d=json.load(open("firebase.json",encoding="utf-8"))["hosting"]
r=d["rewrites"]
assert d["site"]=="garamaal"
assert [x["source"] for x in r]==["/social","/social/bridge.js","/api/social/**","**"]
assert all(x["run"]=={"serviceId":"automate-cv-social","region":"europe-west1"} for x in r[:3])
assert r[3]["run"]=={"serviceId":"automate-cv-dashboard","region":"europe-west1"}
print("HOSTING_ROUTES_VERIFIED: Jobs catch-all unchanged")
PY
check_jobs() {
  local current digest
  current="$(gcloud run services describe automate-cv-dashboard --project="$PROJECT" --region="$REGION" --format='value(status.latestReadyRevisionName)')"
  [[ "$current" == "$REV" ]] || { echo "JOBS REVISION CHANGED -- STOP"; exit 3; }
  digest="$(gcloud run revisions describe "$REV" --project="$PROJECT" --region="$REGION" --format='value(status.imageDigest)')"
  [[ "$digest" == *"$DIGEST" ]] || { echo "JOBS IMAGE CHANGED -- STOP"; exit 3; }
  gcloud run services describe automate-cv-dashboard --project="$PROJECT" --region="$REGION" --format=json |
    python3 -c 'import json,sys; t=json.load(sys.stdin)["status"]["traffic"]; assert len(t)==1 and t[0]["revisionName"]=="automate-cv-dashboard-00027-rrv" and t[0]["percent"]==100,"Jobs traffic changed"'
  echo "JOBS_PROTECTED: $REV, 100% traffic"
}
export LIVE PREVIEW HASH
check_pages() {
  python3 - <<'PY'
import hashlib,os,urllib.request,urllib.error
def get(base,path,method="GET",payload=None):
    req=urllib.request.Request(base+path,method=method,data=payload,headers={"Content-Type":"application/json"})
    try:
        with urllib.request.urlopen(req,timeout=22) as r:return r.status,r.read(2000000)
    except urllib.error.HTTPError as e:return e.code,e.read(10000)
live=os.environ["LIVE"]; preview=os.environ["PREVIEW"]
ls,lb=get(live,"/");ps,pb=get(preview,"/")
ss,sb=get(preview,"/social");bs,bb=get(preview,"/social/bridge.js")
auth,_=get(preview,"/api/social/data","POST",b'{"candidate":"Abhishek"}')
old,_=get(live,"/social")
assert ls==ps==200 and lb==pb and hashlib.sha256(lb).hexdigest()==os.environ["HASH"],"Jobs HTML mismatch"
assert ss==200 and b"Research Inbox" in sb and bs==200 and b"requestSpecial" in bb
assert auth==401 and old==404,"Preview auth or live Social state unexpected"
print("PREVIEW_OK: Social pages/auth and byte-identical Jobs page")
PY
}
check_jobs
check_pages
echo "Deploying Firebase HOSTING ONLY (no Cloud Run deploy)..."
firebase deploy --only hosting --project "$PROJECT" --non-interactive
check_jobs
python3 - <<'PY'
import hashlib,os,time,urllib.error,urllib.request
base=os.environ["LIVE"]
def get(path,method="GET",payload=None):
    req=urllib.request.Request(base+path,method=method,data=payload,headers={"Content-Type":"application/json"})
    try:
        with urllib.request.urlopen(req,timeout=20) as r:return r.status,r.read(2000000)
    except urllib.error.HTTPError as e:return e.code,e.read(10000)
for i in range(8):
    j,html=get("/");s,social=get("/social");b,bridge=get("/social/bridge.js")
    a,_=get("/api/social/data","POST",b'{"candidate":"Abhishek"}')
    if j==200 and hashlib.sha256(html).hexdigest()==os.environ["HASH"] and s==200 and b"Research Inbox" in social and b==200 and a==401:
        print("SOCIAL_LIVE: https://garamaal.web.app/social")
        print("JOBS_ROOT_UNCHANGED")
        break
    if i==7:raise SystemExit("POST_RELEASE_CHECK_FAILED: review Firebase Hosting rollback")
    time.sleep(4)
PY
echo "RELEASE_OK: Social live read-only; Jobs Cloud Run untouched."
