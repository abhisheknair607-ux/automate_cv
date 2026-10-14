"""Bounded retries for transient Google Drive/Sheets transport failures.

All callers must supply idempotent reads or value updates. Never wrap a create
request without a deduplication key: an EOF after a committed create could
otherwise create two objects.
"""
import http.client
import socket
import ssl
import time

from googleapiclient.errors import HttpError


def retry_google(call, attempts=4, sleep=time.sleep):
    for index in range(attempts):
        try:
            return call()
        except (OSError, http.client.HTTPException, HttpError) as error:
            if isinstance(error, HttpError):
                if int(getattr(error.resp, "status", 0)) not in {429, 500, 502, 503, 504}:
                    raise
            elif not isinstance(error, (
                ssl.SSLError, ConnectionResetError, BrokenPipeError,
                ConnectionAbortedError, socket.timeout, TimeoutError,
                http.client.RemoteDisconnected,
            )):
                raise
            if index + 1 >= attempts:
                raise
            pause = min(2 ** index, 8)
            print(f"[google-api] transient {type(error).__name__}; retrying after {pause}s", flush=True)
            sleep(pause)
