#!/usr/bin/env bash
# Garamaal Profile Stage 5 — read-only staging prerequisite audit.
# NEVER deploys, updates IAM, enables APIs, changes environment vars or traffic.
set -euo pipefail
PROJECT="$(printenv GARAMAAL_PROJECT || echo abhishek-cv-automation)"
REGION="$(printenv GARAMAAL_REGION || echo europe-west1)"
SERVICE="$(printenv GARAMAAL_STAGING_SERVICE || echo automate-cv-staging)"
for command in gcloud python3; do command -v "$command" >/dev/null || { echo "Missing $command" >&2; exit 2; }; done
echo "Profile staging read-only audit"
echo "Target project=$PROJECT, region=$REGION, service=$SERVICE"
if [[ "$SERVICE" == "automate-cv-dashboard" && "$(printenv ALLOW_PROFILE_PRODUCTION_INSPECTION || echo false)" != "true" ]]; then
 echo "Refusing the production service by default. Set GARAMAAL_STAGING_SERVICE to a dedicated staging service." >&2
 echo "To inspect production read-only, set ALLOW_PROFILE_PRODUCTION_INSPECTION=true. This script still does not make changes." >&2
 exit 2
fi
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
if ! gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format=json >"$tmp/service.json" 2>"$tmp/describe.err"; then
 echo "Cloud Run service unavailable or missing describe permission. Create/identify an isolated staging service first." >&2
 exit 3
fi
python3 - "$tmp/service.json" <<'PY'
import json,sys
service=json.load(open(sys.argv[1],encoding="utf-8"))
template=service.get("spec",{}).get("template",{}).get("spec",{})
runtime=template.get("serviceAccountName") or "(not configured)"
containers=template.get("containers",[])
env={}
if len(containers)==1:
 env={item["name"]:item for item in containers[0].get("env",[])}
print("Runtime identity:",runtime)
print("Cloud Run container layout:", "single container" if len(containers)==1 else "requires review")
for name in ("MASTER_EVIDENCE_BANK_FILE_ID","SUMMARY_DOC_FILE_ID",
             "POOJA_MASTER_EVIDENCE_BANK_FILE_ID","POOJA_SUMMARY_DOC_FILE_ID"):
 print("Configured variable:",name,"yes" if name in env and
   (env[name].get("value") or env[name].get("valueFrom")) else "NO")
for name in ("GARAMAAL_PROFILE_ENABLED","GARAMAAL_PROFILE_WRITES_APPROVED",
             "GARAMAAL_PROFILE_STAGING_ISOLATED","GARAMAAL_PROFILE_PRODUCTION_APPROVED",
             "APP_READ_ONLY"):
 item=env.get(name,{})
 value=item.get("value")
 print("Control:",name, value if value in ("true","false") else "unset or secret-backed")
scope=env.get("GARAMAAL_PROFILE_DATA_SCOPE",{}).get("value","")
print("Data scope:",scope if scope in ("staging","production") else "UNSET/INVALID")
acl=env.get("GARAMAAL_PROFILE_CANDIDATE_ACL_JSON",{})
print("Candidate ACL:", "configured (contents hidden)" if acl.get("value") or acl.get("valueFrom") else "NOT CONFIGURED")
safe_stage=(scope=="staging" and env.get("APP_READ_ONLY",{}).get("value")!="false"
 and env.get("GARAMAAL_PROFILE_STAGING_ISOLATED",{}).get("value")=="true")
print("Staging isolation prerequisites:", "PASS" if safe_stage else "NOT READY")
if scope=="production" and env.get("GARAMAAL_PROFILE_PRODUCTION_APPROVED",{}).get("value")=="true":
 print("WARNING: production Profile approval flag is enabled. Do not promote without release review.")
traffic=[(v.get("revisionName"),v.get("percent",0)) for v in service.get("status",{}).get("traffic",[]) if int(v.get("percent",0))>0]
print("Active traffic revision count:",len(traffic))
print("NEXT: Test authenticated /api/profile/readiness on this staging service.")
print("Note: env presence does not prove actual Drive or Firestore access.")
PY
if gcloud firestore databases describe --database="(default)" --project="$PROJECT" --format=json >"$tmp/firestore.json" 2>/dev/null; then
 python3 - "$tmp/firestore.json" <<'PY'
import json,sys
data=json.load(open(sys.argv[1],encoding="utf-8"))
print("Firestore default database: exists")
print("Firestore location:",data.get("locationId","unknown"))
PY
else
 echo "Firestore default database: unavailable, not configured, or insufficient viewer permissions"
fi
echo "No configuration, IAM, Firestore data or production traffic was changed."
