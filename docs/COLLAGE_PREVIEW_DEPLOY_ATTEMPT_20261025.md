# Garamaal isolated preview deployment attempt — 2026-10-25

Triggered after user confirmed the deployer has Service Account User permission on the Automate CV Pilot Reader runtime identity.

**Target:** GitHub Actions `.github/workflows/collage-preview.yml`, branch `prototype/collage-frontend-integration-20261025`.

**Safety:** Deploy only the new read-only Cloud Run preview services and Firebase Hosting seven-day preview channel. Never merge into `main`, update live Cloud Run services, or publish the live Firebase Hosting channel. Inspect workflow logs before declaring the preview available.

**Verification:** The workflow result and exact URL must come from the successful GitHub Actions run. This document does not claim a deployment has succeeded.
