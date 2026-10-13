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
