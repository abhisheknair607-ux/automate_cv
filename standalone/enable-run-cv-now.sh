#!/usr/bin/env bash
# One-time secure activation of the existing "Run CV Now" dashboard action.
# Does not dispatch a CV, modify spreadsheets, change hourly workers or deploy source.
set -euo pipefail
PROJECT="abhishek-cv-automation"
REGION="europe-west1"
SERVICE="automate-cv-dashboard"
SECRET="automate-cv-github-dispatch"
RUNTIME_SA="automate-cv-pilot-reader@abhishek-cv-automation.iam.gserviceaccount.com"
echo "Checking production Cloud Run configuration and service account..."
gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format=json | python3 -c '
import json,sys
x=json.load(sys.stdin)
spec=x.get("spec",{}).get("template",{}).get("spec",{})
containers=spec.get("containers",[])
assert containers, "Missing Cloud Run container configuration"
env={v["name"]:v.get("value","") for v in containers[0].get("env",[])}
required={
  "APP_READ_ONLY":"false",
  "APP_ALLOW_PRODUCTION_WRITES":"true",
  "TAAZA_SPREADSHEET_ID":"1jt3WXqpnzVOYcKCpABIp-7UMUPr48kVhMkLfzGEHHZY",
  "FRESHMAL_SPREADSHEET_ID":"1ltT1gPFcpBdz1Wp_CuxkwFpfkwnnhjL316yVu3gxPCc"
}
for key,expected in required.items():
  assert env.get(key)==expected, f"{key} is not the expected live configuration; aborting"
assert spec.get("serviceAccountName")=="automate-cv-pilot-reader@abhishek-cv-automation.iam.gserviceaccount.com", "Unexpected runtime service account; aborting"
print("Production dashboard configuration verified")
'
echo "Enabling Google Secret Manager (does not modify CV automation)..."
gcloud services enable secretmanager.googleapis.com --project="$PROJECT" >/dev/null
if ! gcloud secrets describe "$SECRET" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud secrets create "$SECRET" --replication-policy=automatic --project="$PROJECT" >/dev/null
fi
echo
echo "Create a fine-grained GitHub personal access token, restricted to:"
echo "  Repository: abhisheknair607-ux/automate_cv"
echo "  Repository permission: Actions = Read and write"
echo "  Set an expiry date; avoid broad access or classic PATs."
echo "  https://github.com/settings/personal-access-tokens/new"
echo
IFS= read -r -s -p "Paste your GitHub token here (hidden; never sent to ChatGPT): " GH_TOKEN
echo
if [[ ${#GH_TOKEN} -lt 25 || "$GH_TOKEN" =~ [^a-zA-Z0-9_] ]]; then
  unset GH_TOKEN
  echo "Invalid token format; no Cloud Run changes applied." >&2
  exit 3
fi
# Supply bearer header through curl config on stdin, not CLI flags or shell history.
USER_HTTP="$(printf 'header = "Authorization: Bearer %s"\nheader = "Accept: application/vnd.github+json"\n' "$GH_TOKEN" | curl --silent --show-error --max-time 25 -K - -o /dev/null -w "%{http_code}" https://api.github.com/user)"
if [[ "$USER_HTTP" != "200" ]]; then
  unset GH_TOKEN
  echo "GitHub credential validation returned HTTP $USER_HTTP; no Cloud Run changes applied." >&2
  exit 4
fi
echo "Storing the token only in Google Secret Manager..."
printf "%s" "$GH_TOKEN" | gcloud secrets versions add "$SECRET" --data-file=- --project="$PROJECT" >/dev/null
unset GH_TOKEN
echo "Granting secret access solely to the dashboard runtime account..."
gcloud secrets add-iam-policy-binding "$SECRET" --project="$PROJECT" \
  --member="serviceAccount:$RUNTIME_SA" \
  --role="roles/secretmanager.secretAccessor" --quiet >/dev/null
echo "Enabling manual dispatch on the existing Cloud Run dashboard..."
gcloud run services update "$SERVICE" --project="$PROJECT" --region="$REGION" \
  --update-secrets="GITHUB_WORKFLOW_TOKEN=$SECRET:latest" \
  --update-env-vars="ALLOW_MANUAL_CV_DISPATCH=true" --quiet
echo "Verifying deployment has retained production settings and attached the secret..."
gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format=json | python3 -c '
import json,sys
x=json.load(sys.stdin)
cs=x.get("spec",{}).get("template",{}).get("spec",{}).get("containers",[])
assert cs, "Missing production container"
env={v["name"]:v for v in cs[0].get("env",[])}
assert env.get("APP_READ_ONLY",{}).get("value")=="false", "Read-write setting changed"
assert env.get("APP_ALLOW_PRODUCTION_WRITES",{}).get("value")=="true", "Production write gate changed"
assert env.get("ALLOW_MANUAL_CV_DISPATCH",{}).get("value")=="true", "Dispatch remains disabled"
assert env.get("GITHUB_WORKFLOW_TOKEN",{}).get("valueFrom",{}).get("secretKeyRef"), "GitHub dispatch secret is not attached"
print("Run CV Now dispatch configured; no CV was triggered")
'
echo "Enabled: https://automate-cv-dashboard-597435070079.europe-west1.run.app"
echo "To confirm a real CV run, select an eligible Freshmaal job and click Run CV Now."
