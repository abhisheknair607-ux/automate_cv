import json
import os
import google.auth
from google.oauth2 import credentials as oauth_credentials
from google.oauth2 import service_account

SCOPES=['https://www.googleapis.com/auth/spreadsheets','https://www.googleapis.com/auth/drive']

def credentials(settings):
    # The GitHub worker already authenticates via google-github-actions/auth (WIF).
    # Prefer those verified short-lived credentials over an older stored OAuth
    # refresh token, which can expire/revoke without warning. Local workflows
    # retain OAuth/service-account fallbacks exactly as before.
    if os.getenv('GITHUB_ACTIONS', '').lower() == 'true' and os.getenv('GOOGLE_APPLICATION_CREDENTIALS'):
        creds, _ = google.auth.default(scopes=SCOPES)
        return creds
    if settings.google_oauth_refresh_token:
        return oauth_credentials.Credentials(token=None, refresh_token=settings.google_oauth_refresh_token, token_uri='https://oauth2.googleapis.com/token', client_id=settings.google_oauth_client_id, client_secret=settings.google_oauth_client_secret, scopes=SCOPES)
    if settings.google_service_account_json:
        return service_account.Credentials.from_service_account_info(json.loads(settings.google_service_account_json), scopes=SCOPES)
    creds,_=google.auth.default(scopes=SCOPES)
    return creds
