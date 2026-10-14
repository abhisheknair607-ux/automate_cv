"""Prevent the 2026-10-14 Drive SSL EOF from leaving retryable sheet states stuck."""
import ssl

import pytest

from automate_cv.google_retry import retry_google


def test_ssl_eof_retry_then_success():
    attempts = []
    delays = []

    def request():
        attempts.append(1)
        if len(attempts) < 3:
            raise ssl.SSLEOFError(8, "EOF occurred in violation of protocol")
        return {"ok": True}

    assert retry_google(request, sleep=delays.append) == {"ok": True}
    assert len(attempts) == 3
    assert delays == [1, 2]


def test_ssl_eof_exhaustion_preserves_original_error():
    attempts = []

    def request():
        attempts.append(1)
        raise ssl.SSLEOFError(8, "EOF")

    with pytest.raises(ssl.SSLEOFError):
        retry_google(request, attempts=3, sleep=lambda _: None)
    assert len(attempts) == 3


def test_nontransient_validation_error_is_not_retried():
    attempts = []

    def request():
        attempts.append(1)
        raise ValueError("invalid spreadsheet update")

    with pytest.raises(ValueError):
        retry_google(request, sleep=lambda _: None)
    assert len(attempts) == 1
