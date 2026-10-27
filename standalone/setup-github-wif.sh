#!/usr/bin/env bash
# Run once by a Google Cloud administrator in authenticated Cloud Shell.
# This sets up keyless, repo- and main-branch-scoped GitHub Actions authentication.
# It does NOT deploy, modify Cloud Run traffic, or grant Sheets access.
set -Eeuo pipefail
PROJECT=abhishek-cv-automation
REPO=abhisheknair607-ux/automate_cv
POOL=garamaal-github
PROVIDER=github-main
ACCOUNT=garamaal-github-deployer
RUNTIME=automate-cv-pilot-reader@abhishek-cv-automation.iam.gserviceaccount.com
gcloud config set project "$PROJECT"
gcloud services enable iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com cloudresourcemanager.googleapis.com --project="$PROJECT"
NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
test -n "$NUMBER"
if ! gcloud iam workload-identity-pools describe "$POOL" --project="$PROJECT" --location=global >/dev/null 2>&1; then
 gcloud iam workload-identity-pools create "$POOL" --project="$PROJECT" --location=global --display-name='Garamaal GitHub Actions'
fi
if ! gcloud iam workload-identity-pools providers describe "$PROVIDER" --workload-identity-pool="$POOL" --project="$PROJECT" --location=global >/dev/null 2>&1; then
 gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" \
   --project="$PROJECT" --location=global --workload-identity-pool="$POOL" \
   --display-name='GitHub main only' --issuer-uri='https://token.actions.githubusercontent.com' \
   --attribute-mapping='google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref,attribute.repository_owner=assertion.repository_owner' \
   --attribute-condition="assertion.repository=='$REPO' && assertion.ref=='refs/heads/main' && assertion.repository_owner=='abhisheknair607-ux'"
fi
SA="$ACCOUNT@$PROJECT.iam.gserviceaccount.com"
if ! gcloud iam service-accounts describe "$SA" --project="$PROJECT" >/dev/null 2>&1; then
 gcloud iam service-accounts create "$ACCOUNT" --project="$PROJECT" --display-name='GitHub guarded Cloud Run deployer'
fi
MEMBER="principalSet://iam.googleapis.com/projects/$NUMBER/locations/global/workloadIdentityPools/$POOL/attribute.repository/$REPO"
gcloud iam service-accounts add-iam-policy-binding "$SA" --project="$PROJECT" \
 --role=roles/iam.workloadIdentityUser --member="$MEMBER" --quiet
# Minimal supported grants for guarded gcloud run deploy --source and traffic updates.
for ROLE in roles/run.admin roles/cloudbuild.builds.editor roles/serviceusage.serviceUsageConsumer; do
 gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$SA" --role="$ROLE" --quiet >/dev/null
done
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME" --project="$PROJECT" \
 --member="serviceAccount:$SA" --role=roles/iam.serviceAccountUser --quiet >/dev/null
PROVIDER_RESOURCE="projects/$NUMBER/locations/global/workloadIdentityPools/$POOL/providers/$PROVIDER"
echo
echo "One-time GitHub repository Actions variables to set:"
echo "GCP_WIF_PROVIDER=$PROVIDER_RESOURCE"
echo "GCP_DEPLOY_SERVICE_ACCOUNT=$SA"
echo
echo "In GitHub Settings > Environments, configure 'production' with required reviewers."
echo "Then open Actions > Garamaal guarded Cloud Run deployment > Run workflow (main)."
echo "This bootstrap does not deploy or alter live traffic."
