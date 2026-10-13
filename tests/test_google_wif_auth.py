"""GitHub WIF precedes potentially revoked OAuth only inside GitHub Actions."""
from types import SimpleNamespace

from automate_cv import google_auth


def test_github_wif_beats_stale_refresh_token(monkeypatch):
    sentinel=object()
    calls=[]
    monkeypatch.setenv('GITHUB_ACTIONS','true')
    monkeypatch.setenv('GOOGLE_APPLICATION_CREDENTIALS','/tmp/gha-creds.json')
    monkeypatch.setattr(google_auth.google.auth,'default',lambda **kw: (calls.append(kw) or sentinel,None))
    creds=google_auth.credentials(SimpleNamespace(
        google_oauth_refresh_token='stale',google_oauth_client_id='x',google_oauth_client_secret='x',
        google_service_account_json=''
    ))
    assert creds is sentinel
    assert calls[0]['scopes']==google_auth.SCOPES


def test_local_oauth_fallback_is_preserved(monkeypatch):
    monkeypatch.delenv('GITHUB_ACTIONS',raising=False)
    monkeypatch.delenv('GOOGLE_APPLICATION_CREDENTIALS',raising=False)
    marker=object()
    monkeypatch.setattr(google_auth.oauth_credentials,'Credentials',lambda **kwargs: marker)
    creds=google_auth.credentials(SimpleNamespace(
        google_oauth_refresh_token='refresh',google_oauth_client_id='cid',google_oauth_client_secret='secret',
        google_service_account_json=''
    ))
    assert creds is marker


def test_no_wif_file_uses_standard_refresh_token_path(monkeypatch):
    monkeypatch.setenv('GITHUB_ACTIONS','true')
    monkeypatch.delenv('GOOGLE_APPLICATION_CREDENTIALS',raising=False)
    marker=object()
    monkeypatch.setattr(google_auth.oauth_credentials,'Credentials',lambda **kwargs: marker)
    assert google_auth.credentials(SimpleNamespace(
        google_oauth_refresh_token='refresh',google_oauth_client_id='cid',google_oauth_client_secret='secret',
        google_service_account_json=''
    )) is marker


def test_github_drive_writer_uses_human_oauth_and_its_quota(monkeypatch):
    monkeypatch.setenv('GITHUB_ACTIONS', 'true')
    monkeypatch.setenv('GOOGLE_APPLICATION_CREDENTIALS', '/tmp/gha-creds.json')
    oauth_kwargs = {}
    def create_oauth(**kwargs):
        oauth_kwargs.update(kwargs)
        return object()
    monkeypatch.setattr(google_auth.oauth_credentials, 'Credentials', create_oauth)
    writer = google_auth.drive_credentials(SimpleNamespace(
        google_oauth_refresh_token='human-token',
        google_oauth_client_id='client-id',
        google_oauth_client_secret='client-secret',
    ))
    assert writer is not None
    assert oauth_kwargs['refresh_token'] == 'human-token'
    assert oauth_kwargs['scopes'] == google_auth.SCOPES


def test_github_drive_writer_requires_oauth_before_paid_run(monkeypatch):
    import pytest
    monkeypatch.setenv('GITHUB_ACTIONS', 'true')
    monkeypatch.setenv('GOOGLE_APPLICATION_CREDENTIALS', '/tmp/gha-creds.json')
    config = SimpleNamespace(
        google_oauth_refresh_token='',
        google_oauth_client_id='',
        google_oauth_client_secret='',
        drive_output_folder_id='folder',
    )
    assert google_auth.drive_credentials(config) is None
    with pytest.raises(RuntimeError, match='storage quota'):
        google_auth.verify_drive_writer(None, config)


def test_github_drive_writer_revoked_token_fails_cleanly(monkeypatch):
    import pytest
    from google.auth.exceptions import RefreshError
    monkeypatch.setenv('GITHUB_ACTIONS', 'true')
    monkeypatch.setenv('GOOGLE_APPLICATION_CREDENTIALS', '/tmp/gha-creds.json')
    class InvalidCredentials:
        def refresh(self, request):
            raise RefreshError('invalid_grant')
    drive = SimpleNamespace(credentials=InvalidCredentials(), files=None)
    settings = SimpleNamespace(
        google_oauth_refresh_token='token',
        google_oauth_client_id='client-id',
        google_oauth_client_secret='client-secret',
        drive_output_folder_id='folder',
    )
    with pytest.raises(RuntimeError, match='Renew the expired or revoked'):
        google_auth.verify_drive_writer(drive, settings)


def test_github_drive_writer_validates_folder_access(monkeypatch):
    monkeypatch.setenv('GITHUB_ACTIONS', 'true')
    monkeypatch.setenv('GOOGLE_APPLICATION_CREDENTIALS', '/tmp/gha-creds.json')
    class Credentials:
        refreshed = False
        def refresh(self, request):
            self.refreshed = True
    class Req:
        def execute(self):
            return {'mimeType': 'application/vnd.google-apps.folder',
                    'capabilities': {'canAddChildren': True}}
    class Files:
        def get(self, **kwargs):
            assert kwargs['fileId'] == 'folder'
            return Req()
    creds = Credentials()
    drive = SimpleNamespace(credentials=creds, files=Files())
    settings = SimpleNamespace(
        google_oauth_refresh_token='token',
        google_oauth_client_id='client-id',
        google_oauth_client_secret='client-secret',
        drive_output_folder_id='folder',
    )
    google_auth.verify_drive_writer(drive, settings)
    assert creds.refreshed
