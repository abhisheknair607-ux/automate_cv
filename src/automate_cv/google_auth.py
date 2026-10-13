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


def drive_credentials(settings):
    """Use a human OAuth account to write files to a personal Google Drive.

    WIF service accounts have no quota to create My Drive files.
    """
    if os.getenv('GITHUB_ACTIONS', '').lower() != 'true' or not os.getenv('GOOGLE_APPLICATION_CREDENTIALS'):
        return credentials(settings)
    if not all((settings.google_oauth_refresh_token,
                settings.google_oauth_client_id,
                settings.google_oauth_client_secret)):
        return None
    return oauth_credentials.Credentials(
        token=None,
        refresh_token=settings.google_oauth_refresh_token,
        token_uri='https://oauth2.googleapis.com/token',
        client_id=settings.google_oauth_client_id,
        client_secret=settings.google_oauth_client_secret,
        scopes=SCOPES,
    )


def verify_drive_writer(drive, settings):
    """Fail before any paid CV generation when user Drive OAuth cannot upload."""
    if os.getenv('GITHUB_ACTIONS', '').lower() != 'true' or not os.getenv('GOOGLE_APPLICATION_CREDENTIALS'):
        return
    if not all((settings.google_oauth_refresh_token,
                settings.google_oauth_client_id,
                settings.google_oauth_client_secret)):
        raise RuntimeError(
            'Google Drive user OAuth is missing. A service account has no personal '
            'Google Drive storage quota. Configure the GitHub secrets '
            'GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and '
            'GOOGLE_OAUTH_REFRESH_TOKEN (with Drive scope) before generating CVs.'
        )
    from google.auth.transport.requests import Request
    try:
        drive.credentials.refresh(Request())
        folder = drive.files.get(
            fileId=settings.drive_output_folder_id,
            fields='id,mimeType,capabilities(canAddChildren)',
        ).execute()
    except Exception as exc:
        raise RuntimeError(
            'Google Drive user OAuth could not access the CV output folder. '
            'Renew the expired or revoked GOOGLE_OAUTH_REFRESH_TOKEN, verify '
            'Drive scope and editor access to DRIVE_OUTPUT_FOLDER_ID. '
            'No CV generation was started.'
        ) from exc
    if folder.get('mimeType') != 'application/vnd.google-apps.folder' or (
        folder.get('capabilities') or {}
    ).get('canAddChildren') is False:
        raise RuntimeError(
            'The OAuth Google account cannot create files in the CV output folder. '
            'Use a Drive folder it can edit.'
        )
