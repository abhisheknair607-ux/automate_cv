#!/usr/bin/env python3
"""External, read-only smoke test of deployed Garamaal Social.

No credentials, Sheets mutations, Google Drive files, or CV/LLM API calls.
Run in GitHub Actions with public internet; no secret is required.
"""
import hashlib
import json
import os
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

LIVE = "https://garamaal.web.app"
SOCIAL = "https://automate-cv-social-597435070079.europe-west1.run.app"
EXPECTED_RELEASE = os.getenv("EXPECTED_SOCIAL_SHA", "3305e14684190666c5ae0414632ee5088b2f8859")
failures = []


def request(base, path, method="GET", payload=None):
    headers = {"User-Agent": "Garamal-read-only-release-check/1.0", "Accept": "*/*"}
    if payload is not None:
        headers["Content-Type"] = "application/json"
    req = Request(base + path, data=payload, headers=headers, method=method)
    try:
        with urlopen(req, timeout=25) as result:
            return result.status, result.read(2_500_000), result.headers
    except HTTPError as exc:
        return exc.code, exc.read(20_000), exc.headers
    except (URLError, TimeoutError) as exc:
        raise RuntimeError(f"Could not connect to {base}{path}: {exc}") from exc


def assert_case(label, actual, expect, detail=""):
    good = actual == expect
    print(f"{'PASS' if good else 'FAIL'} {label}: {actual!r}" + (f" {detail}" if detail else ""))
    if not good:
        failures.append(f"{label}: got {actual!r}, expected {expect!r}")


def smoke(base, name):
    status, page, _ = request(base, "/social")
    assert_case(f"{name} /social HTTP", status, 200)
    if status == 200:
        markup = page.decode("utf-8", errors="replace")
        markers = {
            "keyword-only Research Now": 'id="researchNow"',
            "company target picker": 'id="targetCompany"',
            "department target picker": 'id="targetDepartment"',
            "city target picker": 'id="targetCity"',
            "screenshot upload": 'id="chatScreenshot"',
            "chat transcript": 'id="chatTranscript"',
            "editable master template": 'id="templateDialog"',
            "existing campaigns": "campaignSteps.map",
            "optional coffee outreach": "coffeeInvite(c)",
            "separate Research tabs": "function researchTabs()",
        }
        for label, needle in markers.items():
            assert_case(f"{name} {label}", needle in markup, True)
        assert_case(f"{name} removed manual LinkedIn filter input", 'id="targetLink"' in markup, False)
        print(f"INFO {name} Social HTML sha256={hashlib.sha256(page).hexdigest()}")
    status, script, _ = request(base, "/social/bridge.js")
    assert_case(f"{name} /social/bridge.js HTTP", status, 200)
    if status == 200:
        assert_case(f"{name} Firebase bridge present", b"requestSpecial" in script, True)
    for method, path in [("POST", "/api/social/data"), ("POST", "/api/social/targets/list"),
                         ("POST", "/api/social/conversations/list"), ("POST", "/api/social/templates/get")]:
        status, _, _ = request(base, path, method, b'{"candidate":"Abhishek"}')
        assert_case(f"{name} unauthenticated {path}", status, 401)


print("PUBLIC LIVE SMOKE: strictly no authentication, no contact content reads or writes")
try:
    status, body, _ = request(SOCIAL, "/health")
    assert_case("Social Cloud Run /health HTTP", status, 200)
    if status == 200:
        try:
            health = json.loads(body)
        except ValueError:
            failures.append("Social /health returned invalid JSON")
            health = {}
        assert_case("Social service identity", health.get("service"), "garamaal-social")
        assert_case("Social read-only gate", health.get("readOnly"), True)
        assert_case("Social release commit", health.get("release"), EXPECTED_RELEASE)
        print("INFO release:", health.get("release"))
    smoke(SOCIAL, "Cloud Run")
    for path in ["/", "/api/listJobs", "/api/download"]:
        status, _, _ = request(SOCIAL, path)
        assert_case(f"Social has no Jobs endpoint {path}", status, 404)
    smoke(LIVE, "Firebase")
    status, home, _ = request(LIVE, "/")
    assert_case("Firebase Jobs homepage HTTP", status, 200)
    if status == 200:
        print("INFO Jobs root sha256=", hashlib.sha256(home).hexdigest())
except Exception as err:
    failures.append(str(err))
    print("ERROR", type(err).__name__, str(err))

print("SMOKE RESULT:", "PASS" if not failures else f"FAIL ({len(failures)} issues)")
for issue in failures:
    print("  -", issue)
sys.exit(1 if failures else 0)
