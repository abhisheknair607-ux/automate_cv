#!/usr/bin/env bash
# Explicit, staging-only candidate ACL extension after browser Firebase identity verification.
# Deploys only a private tagged revision at 0% traffic. No production changes or profile writes.
set -euo pipefail
PROJECT="abhishek-cv-automation"
REGION="europe-west1"
SERVICE="garamaal-profile-staging"
IDENTITY="garamaal-profile-staging@$PROJECT.iam.gserviceaccount.com"
TAG="profile-authfix"
umask 077
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

if [[ "$(gcloud config get-value project 2>/dev/null)" != "$PROJECT" ]]; then
  echo "STOP: active Cloud Shell project is not the Garamaal staging project." >&2
  exit 2
fi
echo "This operation ONLY changes the candidate ACL on a private, 0%-traffic"
echo "garamaal-profile-staging revision. It does not change production."
echo "First open the Profile preview and locate the Firebase-verified sign-in email."
read -r -p "Enter that exact verified email (not necessarily your Cloud Shell email): " TARGET_EMAIL
[[ -n "$TARGET_EMAIL" ]] || { echo "STOP: missing email" >&2; exit 2; }

gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION"   --format=json > "$TMP/before.json"

python3 - "$TMP/before.json" "$TARGET_EMAIL" "$TMP/acl.json" "$IDENTITY" <<'PY'
import json,sys,re,os
data=json.load(open(sys.argv[1],encoding="utf-8"))
email=sys.argv[2].strip()
out=sys.argv[3]
expected_identity=sys.argv[4]
if not re.fullmatch(r"[a-z0-9._+%-]+@[a-z0-9.-]+\\.[a-z]{2,63}",email):
    raise SystemExit("STOP: enter the exact lowercase Firebase-verified email.")
template=data.get("spec",{}).get("template",{}).get("spec")
if template is None:template=data.get("template",{})
if (template.get("serviceAccountName") or template.get("serviceAccount"))!=expected_identity:
    raise SystemExit("STOP: runtime service identity is not the dedicated staging account.")
containers=template.get("containers",[])
if len(containers)!=1 or not containers[0].get("image"):
    raise SystemExit("STOP: expected exactly one deployable container image.")
env={i["name"]:i.get("value") for i in containers[0].get("env",[])}
required={
 "APP_READ_ONLY":"true",
 "GARAMAAL_PROFILE_ENABLED":"true",
 "GARAMAAL_PROFILE_WRITES_APPROVED":"false",
 "GARAMAAL_PROFILE_STAGING_ISOLATED":"true",
 "GARAMAAL_PROFILE_PRODUCTION_APPROVED":"false",
 "GARAMAAL_PROFILE_DATA_SCOPE":"staging",
}
for key,value in required.items():
 if env.get(key)!=value:raise SystemExit("STOP: unsafe Profile staging configuration: "+key)
if email not in [x.strip().lower() for x in (env.get("ALLOWED_EMAILS") or "").split(",")]:
    raise SystemExit("STOP: email is not already on the Firebase sign-in allowlist.")
try:
 old_acl=json.loads(env["GARAMAAL_PROFILE_CANDIDATE_ACL_JSON"])
except (KeyError,ValueError,TypeError):
 raise SystemExit("STOP: existing ACL missing, secret-backed or invalid.")
if not isinstance(old_acl,dict) or not old_acl:
 raise SystemExit("STOP: existing ACL is invalid.")
for owner,grants in old_acl.items():
 if not isinstance(grants,list) or not grants or any(g not in ("abhishek","pooja") for g in grants):
  raise SystemExit("STOP: unexpected existing ACL entry.")
if email not in old_acl or "abhishek" not in old_acl[email]:
 raise SystemExit("STOP: this email is not already authorized for Abhishek; verify browser identity.")
if "pooja" in old_acl[email]:
 raise SystemExit("Account already has both grants; no configuration changes needed.")
new_acl={k:list(v) for k,v in old_acl.items()}
new_acl[email]=list(dict.fromkeys([*new_acl[email],"pooja"]))
value=json.dumps(new_acl,sort_keys=True,separators=(",",":"))
if "!" in value:raise SystemExit("STOP: unsupported delimiter in ACL; manual review needed.")
with open(out,"w",encoding="utf-8") as f:f.write(value)
os.chmod(out,0o600)
print("Validated Firebase-approved account: "+email)
print("Existing Abhishek grant: yes")
print("Candidate grants after change: abhishek, pooja")
print("Other authorized accounts and grants: preserved")
print("Read-only and production protection gates: PASS")
PY

echo ""
echo "Changes will be limited to this signed-in email and the Pooja staging grant."
read -r -p "Type APPROVE SHARED STAGING ACCESS to authorize this exact grant: " CONFIRM
[[ "$CONFIRM" == "APPROVE SHARED STAGING ACCESS" ]] || {
  echo "No changes made. Approval text did not match."
  exit 2
}

IMAGE="$(python3 - "$TMP/before.json" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
t=d.get("spec",{}).get("template",{}).get("spec")
if t is None:t=d.get("template",{})
print(t["containers"][0]["image"])
PY
)"
ACL="$(cat "$TMP/acl.json")"
echo "Creating a private, tagged, 0%-traffic staging revision (no build)..."
gcloud run deploy "$SERVICE" --image="$IMAGE"   --project="$PROJECT" --region="$REGION" --service-account="$IDENTITY"   --update-env-vars="^!^GARAMAAL_PROFILE_CANDIDATE_ACL_JSON=$ACL"   --no-traffic --tag="$TAG" --no-allow-unauthenticated --quiet
unset ACL

gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION"  --format=json > "$TMP/after.json"
python3 - "$TMP/before.json" "$TMP/after.json" "$TARGET_EMAIL" <<'PY'
import sys,json
before=json.load(open(sys.argv[1]));after=json.load(open(sys.argv[2]));email=sys.argv[3]
def spec(d):
 t=d.get("spec",{}).get("template",{}).get("spec")
 return t if t is not None else d.get("template",{})
def env(d):
 return {x["name"]:x.get("value") for x in spec(d)["containers"][0].get("env",[])}
old=env(before);new=env(after)
for k,v in old.items():
 if k!="GARAMAAL_PROFILE_CANDIDATE_ACL_JSON" and new.get(k)!=v:
  raise SystemExit("STOP: another environment variable changed; investigate before proceeding.")
previous=json.loads(old["GARAMAAL_PROFILE_CANDIDATE_ACL_JSON"])
updated=json.loads(new["GARAMAAL_PROFILE_CANDIDATE_ACL_JSON"])
for k,v in previous.items():
 if k!=email and updated.get(k)!=v:raise SystemExit("STOP: another account's ACL changed.")
if sorted(updated[email])!=["abhishek","pooja"]:raise SystemExit("STOP: new candidate ACL incorrect.")
for x in (after.get("status",{}).get("traffic") or []):
 if x.get("tag")=="profile-authfix" and int(x.get("percent",0))!=0:
  raise SystemExit("STOP: tagged revision has unexpected traffic.")
print("Staging-only ACL grant verified for authenticated email.")
print("All other env vars unchanged; original ACL entries preserved.")
print("New revision:",after.get("status",{}).get("latestReadyRevisionName","(pending)"))
print("Private tagged revision, no production Jobs or Social targeted.")
PY
echo "Next: restart the Cloud Shell proxy with --tag=profile-authfix and verify Pooja twice."
