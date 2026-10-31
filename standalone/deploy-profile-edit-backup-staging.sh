#!/usr/bin/env bash
# Activate candidate-owned editable profiles on a NEW 0%-traffic STAGING revision.
# Read-only Jobs/Sheets operations remain globally locked. Never targets production.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="abhishek-cv-automation"
REGION="europe-west1"
SERVICE="garamaal-profile-staging"
IDENTITY="garamaal-profile-staging@$PROJECT.iam.gserviceaccount.com"
CANDIDATE_LOGIN="abhisheknair607@gmail.com"
[[ "$(git -C "$ROOT" branch --show-current)" == "feature/activate-garamaal-profile-20261031" ]] || { echo "STOP: wrong source branch" >&2; exit 2; }
grep -Fq 'Download backup for Drive' "$ROOT/standalone/profile_engine_v3.js" || { echo "STOP: backup-export control missing" >&2; exit 2; }
grep -Fq 'COPY --chown=node:node standalone ./standalone' "$ROOT/Dockerfile.garamaal-ui" || { echo "STOP: runtime source ownership fix missing" >&2; exit 2; }
for tool in gcloud git python3; do command -v "$tool" >/dev/null || { echo "Missing $tool" >&2; exit 2; }; done
if command -v node >/dev/null; then node --check "$ROOT/standalone/profile_engine_v3.js"; fi

umask 077
TEMP="$(mktemp -d)"
trap 'rm -rf "$TEMP"' EXIT
gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format=json >"$TEMP/current.json"
python3 - "$TEMP/current.json" "$IDENTITY" "$CANDIDATE_LOGIN" <<'PY'
import json,sys
service=json.load(open(sys.argv[1],encoding="utf-8"))
identity,email=sys.argv[2:]
spec=service.get("spec",{}).get("template",{}).get("spec")
if spec is None: spec=service.get("template",{})
if (spec.get("serviceAccountName") or spec.get("serviceAccount"))!=identity:
 raise SystemExit("STOP: wrong Cloud Run identity")
containers=spec.get("containers",[])
if len(containers)!=1:raise SystemExit("STOP: unexpected container layout")
env={x["name"]:x.get("value") for x in containers[0].get("env",[])}
required={
 "APP_READ_ONLY":"true",
 "GARAMAAL_PROFILE_ENABLED":"true",
 "GARAMAAL_PROFILE_STAGING_ISOLATED":"true",
 "GARAMAAL_PROFILE_PRODUCTION_APPROVED":"false",
 "GARAMAAL_PROFILE_DATA_SCOPE":"staging",
 "MASTER_EVIDENCE_BANK_FILE_ID":"1FD2OSAnMpvScnPSawwF7YsyyPoaY84On",
 "SUMMARY_DOC_FILE_ID":"1D9Q7feYCDEhhBVW3DIsJy36Al1yjNIia",
 "POOJA_MASTER_EVIDENCE_BANK_FILE_ID":"1nCV4a4nBYWbBoh3AoIlH3nwFqgd_5JSb",
 "POOJA_SUMMARY_DOC_FILE_ID":"1lT_OP5Il-R8ifvvYqfO0NEARJYzo76SS",
}
for name,value in required.items():
 if env.get(name)!=value:raise SystemExit("STOP: missing or unsafe staging variable: "+name)
if env.get("GARAMAAL_PROFILE_WRITES_APPROVED") not in ("false","true"):
 raise SystemExit("STOP: Profile write flag state is unrecognised")
if email not in [v.strip().lower() for v in env.get("ALLOWED_EMAILS","").split(",")]:
 raise SystemExit("STOP: verified login absent from Firebase allowlist")
try:acl=json.loads(env["GARAMAAL_PROFILE_CANDIDATE_ACL_JSON"])
except (KeyError,ValueError):raise SystemExit("STOP: invalid candidate ACL")
if acl!={email:["abhishek","pooja"]} and acl!={email:["pooja","abhishek"]}:
 raise SystemExit("STOP: expected exact shared candidate staging ACL")
if env.get("APP_ALLOW_PRODUCTION_WRITES")=="true":
 raise SystemExit("STOP: Jobs/Sheets production write flag enabled")
print("PASS: staging identity, 4 sources, both candidates, and Jobs/Sheets read-only protection")
PY

if [[ "$(printenv APPROVE_GARAMAAL_PROFILE_STAGING_EDITS || echo NO)" != "YES" ]]; then
 echo "STOP: set APPROVE_GARAMAAL_PROFILE_STAGING_EDITS=YES to acknowledge Firestore Profile writes" >&2
 exit 3
fi
mkdir -p "$TEMP/build"
cp "$ROOT/Dockerfile.garamaal-ui" "$TEMP/build/Dockerfile"
cp "$ROOT/package.json" "$TEMP/build/package.json"
cp -R "$ROOT/standalone" "$TEMP/build/"
cp -R "$ROOT/garamaal-release-webapp" "$TEMP/build/"

echo "Step 1: deploy backup-enabled application to a private 0%-traffic staging revision, with writes still disabled"
gcloud run deploy "$SERVICE" --source="$TEMP/build" --project="$PROJECT" --region="$REGION" \
 --service-account="$IDENTITY" --no-traffic --tag=profile-backup-readonly \
 --no-allow-unauthenticated --update-env-vars=GARAMAAL_PROFILE_WRITES_APPROVED=false --quiet

echo "Step 2: verify read-only backup revision is healthy"
gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format=json >"$TEMP/built.json"
python3 - "$TEMP/built.json" <<'PY'
import json,sys
s=json.load(open(sys.argv[1],encoding="utf-8")); st=s.get("status",{})
assert st.get("latestReadyRevisionName") and st.get("latestReadyRevisionName")==st.get("latestCreatedRevisionName"),"STOP: staged build not ready"
assert any(x.get("tag")=="profile-backup-readonly" and int(x.get("percent") or 0)==0 for x in st.get("traffic",[])),"STOP: tagged zero-traffic backup revision missing"
print("PASS: backup-enabled image ready at 0% traffic")
PY

echo "Step 3: activate only Profile writing, on another private 0%-traffic revision"
gcloud run services update "$SERVICE" --project="$PROJECT" --region="$REGION" \
 --no-traffic --tag=profile-edit \
 --update-env-vars=GARAMAAL_PROFILE_WRITES_APPROVED=true --quiet

gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format=json >"$TEMP/final.json"
python3 - "$TEMP/final.json" <<'PY'
import json,sys
s=json.load(open(sys.argv[1],encoding="utf-8"))
spec=s.get("spec",{}).get("template",{}).get("spec")
if spec is None:spec=s.get("template",{})
env={x["name"]:x.get("value") for x in spec["containers"][0]["env"]}
assert env["APP_READ_ONLY"]=="true" and env["GARAMAAL_PROFILE_WRITES_APPROVED"]=="true"
assert env["GARAMAAL_PROFILE_DATA_SCOPE"]=="staging" and env["GARAMAAL_PROFILE_STAGING_ISOLATED"]=="true"
st=s["status"]; assert st.get("latestCreatedRevisionName")==st.get("latestReadyRevisionName")
assert any(x.get("tag")=="profile-edit" and int(x.get("percent") or 0)==0 for x in st.get("traffic",[]))
print("PASS: editable Profile ready at 0% traffic; Jobs/Sheets still read-only")
print("New revision:",st["latestReadyRevisionName"])
PY
echo "NEXT: gcloud run services proxy $SERVICE --project=$PROJECT --region=$REGION --tag=profile-edit --port=8081"
echo "Only use the Cloud Shell preview on port 8081; production Garamaal was not modified."
