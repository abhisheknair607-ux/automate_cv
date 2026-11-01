#!/usr/bin/env bash
# Beta-only: live Garamaal UI -> private 0%-traffic Profile staging.
# Production Jobs, Social, and Python CV worker must stay unchanged.
set -Eeuo pipefail
MODE="$1"
test "$MODE" = --plan -o "$MODE" = --release || { echo "Usage: $0 [--plan|--release]"; exit 2; }
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="abhishek-cv-automation"
REGION="europe-west1"
SERVICE="automate-cv-dashboard"
STAGING="garamaal-profile-staging"
PINNED_STAGING_REV="$(printenv GARAMAAL_EXPECTED_STAGING_REV || true)"
EXPECTED_LIVE_BETA_REV="$(printenv GARAMAAL_EXPECTED_LIVE_BETA_REV || true)"
if [[ -n "$EXPECTED_LIVE_BETA_REV" ]]; then
 [[ "$EXPECTED_LIVE_BETA_REV" =~ ^automate-cv-dashboard-[0-9]{5}-[a-z0-9]+$ ]] || { echo "Invalid expected live beta revision" >&2; exit 2; }
fi
[[ "$PINNED_STAGING_REV" =~ ^garamaal-profile-staging-[0-9]{5}-[a-z0-9]+$ ]] || { echo "Pin a freshly tested staging revision in GARAMAAL_EXPECTED_STAGING_REV" >&2; exit 2; }
[[ "$PINNED_STAGING_REV" != "garamaal-profile-staging-00010-xih" ]] || { echo "Old staging revision lacks JD matching" >&2; exit 2; }
PROD_SA="automate-cv-pilot-reader@abhishek-cv-automation.iam.gserviceaccount.com"
TEST_EMAIL="abhisheknair607@gmail.com"
TAG="prof-beta"
test "$(git -C "$ROOT" branch --show-current)" = "feature/garamaal-site-profile-beta-20261101"
git -C "$ROOT" diff --quiet
git -C "$ROOT" diff --cached --quiet
for c in gcloud git python3 curl node; do command -v "$c" >/dev/null; done
node --check "$ROOT/standalone/server.js"
node --check "$ROOT/standalone/profile_beta_proxy.js"
node --check "$ROOT/standalone/profile_beta_ui.js"
umask 077
TMP="$(mktemp -d)"
BASELINE=""
PROMOTED=0
failback() {
 rc=$?
 if test "$PROMOTED" = 1; then
  echo "Validation failed: restoring production traffic to $BASELINE" >&2
  gcloud run services update-traffic "$SERVICE" --project "$PROJECT" --region "$REGION" \
    --to-revisions="$BASELINE" --quiet || echo "ROLLBACK FAILED - investigate immediately" >&2
 fi
 rm -rf "$TMP"
 exit "$rc"
}
trap failback ERR
trap 'rm -rf "$TMP"' EXIT
gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format=json > "$TMP/prod.json"
gcloud run services describe "$STAGING" --project "$PROJECT" --region "$REGION" --format=json > "$TMP/stage.json"
# A failed --no-traffic deploy can update the latest service template without
# updating the revision receiving traffic. Validate the latter independently.
LIVE_REV="$(python3 - "$TMP/prod.json" <<'PY'
import json,sys
service=json.load(open(sys.argv[1],encoding="utf-8"))
traffic=[t for t in service.get("status",{}).get("traffic",[]) if int(t.get("percent",0))>0]
assert len(traffic)==1 and int(traffic[0].get("percent",0))==100, "Expected one 100%-traffic production revision"
print(traffic[0]["revisionName"])
PY
)"
gcloud run revisions describe "$LIVE_REV" --project "$PROJECT" --region "$REGION" --format=json > "$TMP/live.json"
BASELINE="$(python3 - "$TMP/prod.json" "$TMP/stage.json" "$TMP/live.json" "$PINNED_STAGING_REV" "$EXPECTED_LIVE_BETA_REV" <<'PY'
import json,sys
p,s,live=(json.load(open(x,encoding="utf-8")) for x in sys.argv[1:4])
def spec(o):return o.get("spec",{}).get("template",{}).get("spec",{})
def e(o):
 cs=spec(o).get("containers",[])
 assert len(cs)==1
 return {v["name"]:v for v in cs[0].get("env",[])}
a,b=e(p),e(s)
assert spec(p).get("serviceAccountName")=="automate-cv-pilot-reader@abhishek-cv-automation.iam.gserviceaccount.com"
assert spec(s).get("serviceAccountName")=="garamaal-profile-staging@abhishek-cv-automation.iam.gserviceaccount.com"
for k,v in {"APP_READ_ONLY":"false","APP_ALLOW_PRODUCTION_WRITES":"true",
"ALLOW_MANUAL_CV_DISPATCH":"true","TAAZA_SPREADSHEET_ID":"1jt3WXqpnzVOYcKCpABIp-7UMUPr48kVhMkLfzGEHHZY",
"FRESHMAL_SPREADSHEET_ID":"1ltT1gPFcpBdz1Wp_CuxkwFpfkwnnhjL316yVu3gxPCc"}.items():
 assert a.get(k,{}).get("value")==v,"Production safety setting changed: "+k
assert a.get("GITHUB_WORKFLOW_TOKEN",{}).get("valueFrom",{}).get("secretKeyRef")
# A failed canary can leave these beta flags in the service template.
# Do NOT trust this template to establish what current users are seeing.
def revspec(r):
    v=r.get("spec",{})
    return v if "containers" in v else r.get("template",{})
live_spec=revspec(live)
assert live_spec.get("serviceAccountName",live_spec.get("serviceAccount"))==spec(p).get("serviceAccountName"), "Live revision changed service identity"
live_env={x["name"]:x for x in live_spec.get("containers",[])[0].get("env",[])}
expected_beta=sys.argv[5]
live_rev=next(t["revisionName"] for t in p["status"]["traffic"] if int(t.get("percent",0))==100)
if expected_beta:
 assert live_rev==expected_beta, "STOP: production beta revision has changed; review before deploy"
 for k,v in {"GARAMAAL_PROFILE_BETA_ENABLED":"true","GARAMAAL_PROFILE_BETA_DATA_SCOPE":"staging","GARAMAAL_PROFILE_BETA_EMAIL":"abhisheknair607@gmail.com"}.items():
  assert live_env.get(k,{}).get("value")==v, "STOP: live beta identity/scope mismatch: "+k
else:
 assert live_env.get("GARAMAAL_PROFILE_BETA_ENABLED",{}).get("value") in (None,"false"), "Stop: beta already enabled on traffic-serving revision; explicitly pin old beta revision"
for k in ("APP_READ_ONLY","APP_ALLOW_PRODUCTION_WRITES","ALLOW_MANUAL_CV_DISPATCH","TAAZA_SPREADSHEET_ID","FRESHMAL_SPREADSHEET_ID"):
 assert live_env.get(k)==a.get(k), "Live revision and service template disagree on "+k
assert live_env.get("GITHUB_WORKFLOW_TOKEN")==a.get("GITHUB_WORKFLOW_TOKEN"), "Live GitHub token binding changed"
for k,v in {"APP_READ_ONLY":"true","GARAMAAL_PROFILE_STAGING_ISOLATED":"true",
"GARAMAAL_PROFILE_DATA_SCOPE":"staging","GARAMAAL_PROFILE_ENABLED":"true",
"GARAMAAL_PROFILE_WRITES_APPROVED":"true","GARAMAAL_PROFILE_PRODUCTION_APPROVED":"false"}.items():
 assert b.get(k,{}).get("value")==v,"Staging safety setting changed: "+k
tags=[x for x in s["status"]["traffic"] if x.get("tag")=="profile-edit"]
assert len(tags)==1 and tags[0].get("revisionName")==sys.argv[4] and int(tags[0].get("percent",0))==0
assert s["status"].get("latestReadyRevisionName")==sys.argv[4],"Staging match/edit build is not the latest ready revision"
live=[(x["revisionName"],int(x["percent"])) for x in p["status"]["traffic"] if int(x.get("percent",0))>0]
assert sum(n for _,n in live)==100
print(",".join(x+"="+str(n) for x,n in live))
PY
)"
echo "Guard passed. Live rollback baseline: $BASELINE"
if test "$MODE" = --plan; then echo "PLAN OK. NO CHANGES."; exit 0; fi
test "$(printenv APPROVE_GARAMAAL_SITE_PROFILE_BETA || echo NO)" = YES || {
 echo "Explicit website beta approval missing" >&2; exit 3; }
gcloud run services add-iam-policy-binding "$STAGING" --project "$PROJECT" --region "$REGION" \
 --member="serviceAccount:$PROD_SA" --role=roles/run.invoker --quiet >/dev/null
mkdir "$TMP/build"
cp "$ROOT/Dockerfile.garamaal-ui" "$TMP/build/Dockerfile"
cp "$ROOT/package.json" "$TMP/build/package.json"
cp -R "$ROOT/standalone" "$TMP/build/standalone"
cp -R "$ROOT/garamaal-release-webapp" "$TMP/build/garamaal-release-webapp"
# umask 077 must protect temporary files, but its 0600 copies cause EACCES
# inside the container where the app runs as the unprivileged `node` user.
# Only the deployment source bundle is made readable; no persistent files change.
chmod -R a+rX "$TMP/build"
gcloud run deploy "$SERVICE" --project "$PROJECT" --region "$REGION" \
 --source "$TMP/build" --no-traffic --tag="$TAG" \
 --update-env-vars="GARAMAAL_PROFILE_BETA_ENABLED=true,GARAMAAL_PROFILE_BETA_DATA_SCOPE=staging,GARAMAAL_PROFILE_BETA_EMAIL=$TEST_EMAIL" \
 --quiet
gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format=json > "$TMP/canary.json"
python3 - "$TMP/prod.json" "$TMP/canary.json" <<'PY'
import json,sys
p,n=(json.load(open(x)) for x in sys.argv[1:])
def env(o):
 return {x["name"]:x for x in o["spec"]["template"]["spec"]["containers"][0]["env"]}
a,b=env(p),env(n)
added={"GARAMAAL_PROFILE_BETA_ENABLED":"true","GARAMAAL_PROFILE_BETA_DATA_SCOPE":"staging",
       "GARAMAAL_PROFILE_BETA_EMAIL":"abhisheknair607@gmail.com"}
assert set(b)==set(a)|set(added),"Unexpected environment additions or removals"
assert all(b[k]==v for k,v in a.items() if k not in added),"Existing non-beta secret/env changed"
assert all(b[k].get("value")==v for k,v in added.items())
assert p["spec"]["template"]["spec"]["serviceAccountName"]==n["spec"]["template"]["spec"]["serviceAccountName"]
def traffic(s):return sorted((t["revisionName"],int(t["percent"])) for t in s["status"]["traffic"] if int(t.get("percent",0))>0)
assert traffic(p)==traffic(n),"Canary unexpectedly modified live traffic"
PY
URL="$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format=json | \
 python3 -c 'import json,sys; x=json.load(sys.stdin); t=[y for y in x["status"]["traffic"] if y.get("tag")=="prof-beta"]; assert len(t)==1 and not int(t[0].get("percent",0)); print(t[0]["url"])')"
REV="$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format=json | \
 python3 -c 'import json,sys; x=json.load(sys.stdin); t=[y for y in x["status"]["traffic"] if y.get("tag")=="prof-beta"]; print(t[0]["revisionName"])')"
curl -fsSL --max-time 30 "$URL/health" -o "$TMP/health.json"
python3 - "$TMP/health.json" <<'PY'
import json,sys
x=json.load(open(sys.argv[1]));assert x.get("ok") and x.get("readOnly")==False
PY
curl -fsSL --max-time 30 "$URL/prototype" -o "$TMP/canary.html"
grep -Fq '/prototype/profile-beta-ui.js?v=sitebeta2' "$TMP/canary.html"
grep -Fq '/prototype/hub-swipe.js' "$TMP/canary.html"
grep -Fq '/prototype/copper-porcelain.css' "$TMP/canary.html"
curl -fsSL --max-time 30 "$URL/prototype/profile-beta-ui.js" -o "$TMP/beta.js"
grep -Fq 'Find my strongest evidence' "$TMP/beta.js"
grep -Fq 'Import Profile JSON' "$TMP/beta.js"
grep -Fq 'Switch to Pooja' "$TMP/beta.js"
STATUS="$(curl -sS --max-time 30 -o "$TMP/deny.json" -w '%{http_code}' \
 -X POST -H "Content-Type: application/json" -d '{"candidate":"pooja"}' \
 "$URL/api/profile/structured/read")"
test "$STATUS" = 401 || { echo "STOP: unauthenticated beta API must be 401, got $STATUS" >&2; exit 2; }
echo "Canary verified (0% traffic). Promoting to website with rollback guard."
PROMOTED=1
gcloud run services update-traffic "$SERVICE" --project "$PROJECT" --region "$REGION" \
 --to-revisions="$REV=100" --quiet
curl -fsSL --max-time 45 "https://garamaal.web.app/prototype?site_beta_verify=$REV" \
 -o "$TMP/live.html"
grep -Fq '/prototype/profile-beta-ui.js?v=sitebeta1' "$TMP/live.html"
PROMOTED=0
echo "PROFILE BETA AVAILABLE: https://garamaal.web.app/prototype"
echo "Allowed account: $TEST_EMAIL"
echo "PRODUCTION CV WORKER / GOOGLE DRIVE SOURCE UNCHANGED."
echo "Rollback (if needed): gcloud run services update-traffic $SERVICE --project=$PROJECT --region=$REGION --to-revisions=$BASELINE"
