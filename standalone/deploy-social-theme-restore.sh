#!/usr/bin/env bash
# Social-only, reversible Cloud Run theme rollout. Preserves live write policy,
# service account, sheets configuration, Jobs revision and Firebase Hosting.
set -Eeuo pipefail
MODE="${1:---plan}"
[[ "$MODE" == "--plan" || "$MODE" == "--release" ]] || { echo "Usage: $0 [--plan|--release]" >&2; exit 2; }
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT=abhishek-cv-automation
REGION=europe-west1
SOCIAL=automate-cv-social
JOBS=automate-cv-dashboard
TAG=social-theme-qa
for cmd in git gcloud curl python3; do command -v "$cmd" >/dev/null || { echo "$cmd missing" >&2; exit 2; }; done
[[ "$(git -C "$ROOT" branch --show-current)" == "fix/firebase-garamaal-status-contacts-20261016" ]] || {
 echo "Use the approved Social release branch" >&2; exit 2;
}
git -C "$ROOT" diff --quiet
git -C "$ROOT" diff --cached --quiet
for file in social_server.js mobile_social_hub.js social_theme_collage.css social_theme_hubs.css social_theme_restore.css; do
 test -s "$ROOT/standalone/$file"
done
TMP="$(mktemp -d)"
PROMOTED=0
BASELINE=""
cleanup(){ code=$?; if [[ "$PROMOTED" == 1 && -n "$BASELINE" ]]; then
  echo "Restoring previous Social traffic: $BASELINE" >&2
  gcloud run services update-traffic "$SOCIAL" --project="$PROJECT" --region="$REGION" --to-revisions="$BASELINE" --quiet ||
    echo "ALERT: rollback did not complete" >&2
 fi
 rm -rf "$TMP"
 exit "$code"
}
trap cleanup ERR
trap 'rm -rf "$TMP"' EXIT
gcloud run services describe "$SOCIAL" --project="$PROJECT" --region="$REGION" --format=json > "$TMP/social-old.json"
gcloud run services describe "$JOBS" --project="$PROJECT" --region="$REGION" --format=json > "$TMP/jobs-old.json"
BASELINE="$(python3 - "$TMP/social-old.json" <<'PY'
import json,sys
s=json.load(open(sys.argv[1],encoding="utf8"))
t=[(v.get("revisionName"),int(v.get("percent",0))) for v in s["status"]["traffic"] if int(v.get("percent",0))>0]
assert len(t)==1 and t[0][1]==100 and t[0][0], "Expected one live Social revision"
spec=s["spec"]["template"]["spec"]
assert spec.get("serviceAccountName","").endswith(".gserviceaccount.com"),"Unexpected service account"
env={x["name"]:x.get("value") for x in spec["containers"][0].get("env",[])}
assert env.get("FRESHMAL_SPREADSHEET_ID") and env.get("ALLOWED_EMAILS"),"Social access settings missing"
print(t[0][0]+"=100")
PY
)"
echo "Existing Social revision: $BASELINE"
echo "Jobs service remains untouched. All Social live edit permissions remain unchanged."
if [[ "$MODE" == "--plan" ]]; then echo "PLAN OK — no deployment performed";exit 0;fi
mkdir -p "$TMP/build"
cp "$ROOT/Dockerfile.social" "$TMP/build/Dockerfile"
cp "$ROOT/package.json" "$TMP/build/package.json"
cp -R "$ROOT/standalone" "$TMP/build/standalone"
gcloud run deploy "$SOCIAL" --source="$TMP/build" --project="$PROJECT" --region="$REGION" \
 --no-traffic --tag "$TAG" --quiet
gcloud run services describe "$SOCIAL" --project="$PROJECT" --region="$REGION" --format=json > "$TMP/social-canary.json"
gcloud run services describe "$JOBS" --project="$PROJECT" --region="$REGION" --format=json > "$TMP/jobs-canary.json"
readarray -t DATA < <(python3 - "$TMP/social-old.json" "$TMP/social-canary.json" "$TMP/jobs-old.json" "$TMP/jobs-canary.json" "$TAG" <<'PY'
import json,sys
a,b,j,k=[json.load(open(p,encoding="utf8")) for p in sys.argv[1:5]]
def live(x):return [(t.get("revisionName"),int(t.get("percent",0))) for t in x["status"]["traffic"] if int(t.get("percent",0))>0]
assert live(a)==live(b),"Social production traffic changed during canary"
assert live(j)==live(k) and j["status"].get("latestReadyRevisionName")==k["status"].get("latestReadyRevisionName"),"Jobs changed"
sa=lambda x:x["spec"]["template"]["spec"].get("serviceAccountName")
assert sa(a)==sa(b),"Social runtime identity changed"
env=lambda x:x["spec"]["template"]["spec"]["containers"][0].get("env",[])
assert env(a)==env(b),"Social environment or secrets changed"
tags=[x for x in b["status"]["traffic"] if x.get("tag")==sys.argv[5]]
assert len(tags)==1 and not int(tags[0].get("percent",0)),"Canary not at 0%"
print(tags[0].get("revisionName",""));print(tags[0].get("url",""))
PY
)"
REV="${DATA[0]:-}";URL="${DATA[1]:-}"
[[ "$REV" == automate-cv-social-* && "$URL" == https://* ]] || { echo "Invalid Social canary" >&2;exit 3; }
for route in /social /social/theme-collage.css /social/theme-hubs.css /social/theme-restore.css /social/theme-shell.js; do
 curl -fsSL --max-time 30 "$URL$route" -o "$TMP/$(basename "$route")"
done
grep -Fq 'theme-collage.css' "$TMP/social"
grep -Fq 'gmv3-social-workspace' "$TMP/theme-collage.css"
grep -Fq '"verify"' "$TMP/theme-shell.js"
curl -fsSL --max-time 30 "$URL/health" -o "$TMP/social-health.json"
python3 - "$TMP/social-health.json" <<'PY'
import json,sys
x=json.load(open(sys.argv[1],encoding="utf8"))
assert x.get("ok") is True and x.get("service")=="garamaal-social"
PY
status="$(curl -sS --max-time 30 -o /dev/null -w '%{http_code}' -X POST "$URL/api/social/data" -H 'Content-Type: application/json' -d '{"candidate":"Abhishek"}')"
[[ "$status" == 401 ]] || { echo "Social authentication gate failed" >&2;exit 3; }
echo "SOCIAL CANARY VERIFIED: $REV; production traffic unchanged"
PROMOTED=1
gcloud run services update-traffic "$SOCIAL" --project="$PROJECT" --region="$REGION" --to-revisions="$REV=100" --quiet
gcloud run services describe "$SOCIAL" --project="$PROJECT" --region="$REGION" --format=json > "$TMP/social-live.json"
gcloud run services describe "$JOBS" --project="$PROJECT" --region="$REGION" --format=json > "$TMP/jobs-live.json"
python3 - "$TMP/social-live.json" "$TMP/jobs-old.json" "$TMP/jobs-live.json" "$REV" <<'PY'
import json,sys
s,j,k=[json.load(open(p,encoding="utf8")) for p in sys.argv[1:4]]
assert sum(int(t.get("percent",0)) for t in s["status"]["traffic"] if t.get("revisionName")==sys.argv[4])==100
assert j["status"].get("latestReadyRevisionName")==k["status"].get("latestReadyRevisionName"),"Jobs revision changed"
assert [(t.get("revisionName"),t.get("percent",0)) for t in j["status"]["traffic"]]==[(t.get("revisionName"),t.get("percent",0)) for t in k["status"]["traffic"]],"Jobs traffic changed"
PY
curl -fsSL --max-time 35 'https://garamaal.web.app/social' -o "$TMP/live-html"
grep -Fq 'theme-collage.css' "$TMP/live-html"
PROMOTED=0
echo "SOCIAL PRODUCTION VERIFIED: $REV 100%; Jobs unchanged"
