"""Stage 6: zero-network evidence selection and CV handoff regression tests."""
import hashlib
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from automate_cv import sources
from automate_cv.profile_cv_adapter import (
    ProfileEvidenceError, _document, profile_evidence_mode,
    read_pinned_snapshot, select_evidence, prepare_evidence, preserve_drive_core,
)

ID = "PR-POOJA-LIFEGOALS"
OWNER = "a" * 64
ENV = {
    "GARAMAAL_CV_EVIDENCE_MODE": "compare",
    "GARAMAAL_PROFILE_DATA_SCOPE": "staging",
    "GARAMAAL_PROFILE_CV_STAGING_ISOLATED": "true",
    "GARAMAAL_PROFILE_CV_GCP_PROJECT": "garamaal-staging",
    "GARAMAAL_PROFILE_CV_OWNER_DIGEST_POOJA": OWNER,
    "GARAMAAL_PROFILE_CV_REVISION_POOJA": "7",
}
MASTER_ID = "source-document-master-0123456"


def profile():
    return {
        "candidate": "pooja", "revision": 7, "imported": True, "historySchema": 5,
        "sources": [
            {"kind": "master", "fileId": MASTER_ID, "sha256": "abc123"},
            {"kind": "router", "fileId": "source-document-router-012345", "sha256": "def456"},
        ],
        "sections": [],
        "records": [{
            "id": "source-record-one", "title": "LifeGoals project",
            "section": "projects",
            "status": "verified", "cvEligible": True,
            "classificationReviewed": True, "metricsReviewed": True,
            "metrics": ["5 teams"],
            "originalText": "Managed 5 teams during a documented product delivery programme.",
            "star": {
                "situation": "Documented product delivery programme.",
                "task": "", "action": "Managed 5 teams.", "result": "",
            },
            "tags": ["project management"], "cvBullet": "Managed 5 teams.",
            "source": {
                "kind": "master", "fileId": MASTER_ID, "locator": "EVIDENCE " + ID,
                "evidenceKey": ID, "lineStart": 10, "lineEnd": 18,
            },
        }],
    }


def test_drive_is_unconditionally_default_and_never_requests_profile():
    assert profile_evidence_mode({}) == "drive"
    assert profile_evidence_mode({"GARAMAAL_CV_EVIDENCE_MODE": "drive"}) == "drive"
    with pytest.raises(ProfileEvidenceError, match="Drive mode"):
        read_pinned_snapshot("pooja", environ={"GARAMAAL_CV_EVIDENCE_MODE": "drive"})


@pytest.mark.parametrize("mode", ["compare", "profile"])
def test_profile_evidence_requires_staging_and_correct_guards(mode):
    with pytest.raises(ProfileEvidenceError, match="isolated staging"):
        profile_evidence_mode({"GARAMAAL_CV_EVIDENCE_MODE": mode})
    flags = {**ENV, "GARAMAAL_CV_EVIDENCE_MODE": mode}
    if mode == "profile":
        with pytest.raises(ProfileEvidenceError, match="not approved"):
            profile_evidence_mode(flags)
        flags["GARAMAAL_PROFILE_CV_CUTOVER_APPROVED"] = "true"
    assert profile_evidence_mode(flags) == mode


def test_verified_profile_includes_only_selected_evidence_and_provenance():
    selected = select_evidence(profile(), [ID], candidate="pooja")
    assert selected.selected_ids == (ID,)
    assert selected.accepted_ids == (ID,)
    assert selected.missing_ids == ()
    assert selected.revision == 7
    assert "Source master SHA-256: abc123" in selected.package
    assert "Original source file: " + MASTER_ID in selected.package
    assert "Managed 5 teams" in selected.package
    assert "Situation: Documented product delivery programme." in selected.package
    assert "project management" not in selected.package  # not stated in original source


@pytest.mark.parametrize("mutation", [
    {"status": "needs-review"},
    {"metricsReviewed": False},
    {"classificationReviewed": False},
    {"cvEligible": False},
    {"sourceDrift": True},
    {"sourceMissing": True},
    {"duplicateOf": "another"},
    {"section": "guardrails"},
    {"cvBullet": "Managed 80 teams."},
    {"workingText": "Managed €99M."},
])
def test_unreviewed_or_modified_evidence_is_excluded(mutation):
    p = profile()
    p["records"][0].update(mutation)
    chosen = select_evidence(p, [ID], candidate="pooja")
    assert chosen.accepted_ids == ()
    assert chosen.missing_ids == (ID,)
    assert "Managed 5 teams." not in chosen.package.split("## STAGE 2 EVIDENCE COVERAGE")[0]


def test_cross_candidate_and_missing_stage2_ids_fail_closed():
    p = profile()
    with pytest.raises(ProfileEvidenceError, match="Candidate"):
        select_evidence(p, [ID], candidate="abhishek")
    with pytest.raises(ProfileEvidenceError, match="another candidate"):
        select_evidence(p, ["PR-EY-FAR"], candidate="pooja")
    with pytest.raises(ProfileEvidenceError, match="Stage 2 selected no"):
        select_evidence(p, [], candidate="pooja")
    assert select_evidence(p, ["FIN-POOJA-MORGANS"], candidate="pooja").missing_ids


def firestore_value(value):
    if isinstance(value, bool):
        return {"booleanValue": value}
    if isinstance(value, int):
        return {"integerValue": str(value)}
    if isinstance(value, str):
        return {"stringValue": value}
    if value is None:
        return {"nullValue": None}
    if isinstance(value, list):
        return {"arrayValue": {"values": [firestore_value(v) for v in value]}}
    if isinstance(value, dict):
        return {"mapValue": {"fields": {k: firestore_value(v) for k, v in value.items()}}}
    raise TypeError(type(value))


class Response:
    status_code = 200

    def __init__(self, data):
        self.data = data

    def json(self):
        return {"fields": {k: firestore_value(v) for k, v in self.data.items()}}


class Transport:
    def __init__(self, snapshot):
        self.snapshot = snapshot
        self.urls = []

    def get(self, url, timeout=20):
        self.urls.append(url)
        if url.endswith("/versions/0000000007"):
            s = self.snapshot
            return Response({
                "candidate": "pooja", "revision": 7,
                "recordCount": len(s["records"]), "profile": s,
                "sourceHashes": [{"kind": x["kind"], "sha256": x["sha256"]}
                                 for x in s["sources"]],
            })
        return Response(self.snapshot)


def test_firestore_reader_limits_urls_to_pinned_owner_candidate_version():
    transport = Transport(profile())
    doc = read_pinned_snapshot("pooja", environ=ENV, transport=transport)
    assert doc["revision"] == 7
    assert len(transport.urls) == 2
    assert all("/" + OWNER + "/candidates/pooja" in url for url in transport.urls)
    assert transport.urls[1].endswith("/versions/0000000007")
    assert all("garamaalProfilesStagingV1" in url for url in transport.urls)
    assert all("garamaalProfilesV1/" not in url for url in transport.urls)


def test_snapshot_mismatch_or_wrong_owner_configuration_fails_closed():
    transport = Transport({**profile(), "candidate": "abhishek"})
    with pytest.raises(ProfileEvidenceError, match="ownership"):
        read_pinned_snapshot("pooja", environ=ENV, transport=transport)
    with pytest.raises(ProfileEvidenceError, match="owner digest"):
        read_pinned_snapshot("pooja", environ={**ENV,
            "GARAMAAL_PROFILE_CV_OWNER_DIGEST_POOJA": "bad"}, transport=Transport(profile()))


def test_comparison_only_writes_local_coverage_not_cv_source(tmp_path):
    mode, ev = prepare_evidence("pooja", [ID, "FIN-POOJA-MORGANS"], tmp_path,
                                environ=ENV, transport=Transport(profile()))
    assert mode == "compare"
    audit = json.loads((tmp_path / "Profile_Evidence_Comparison.json").read_text())
    assert audit["revision"] == 7 and audit["missing"] == ["FIN-POOJA-MORGANS"]
    assert not (tmp_path / "Selected_Evidence.md").exists()
    assert ev.accepted_ids == (ID,)


def test_profile_cutover_rejects_any_missing_selected_stage2_key(tmp_path):
    flags = {**ENV, "GARAMAAL_CV_EVIDENCE_MODE": "profile",
             "GARAMAAL_PROFILE_CV_CUTOVER_APPROVED": "true"}
    with pytest.raises(ProfileEvidenceError, match="lacks reviewed"):
        prepare_evidence("pooja", [ID, "FIN-POOJA-MORGANS"], tmp_path,
                         environ=flags, transport=Transport(profile()))
    mode, ev = prepare_evidence("pooja", [ID], tmp_path,
                                 environ=flags, transport=Transport(profile()))
    assert mode == "profile" and ev.accepted_ids == (ID,)


def test_source_handoff_does_not_read_profile_in_default_drive_mode(tmp_path, monkeypatch):
    # No Firestore endpoint or secrets are required in the historical workflow.
    original = """CANDIDATE KEY pooja
EVIDENCE CORE-CHRONOLOGY
Previous employment
END EVIDENCE CORE-CHRONOLOGY
EVIDENCE CORE-CREDENTIALS
MSc Finance
END EVIDENCE CORE-CREDENTIALS
EVIDENCE CORE-GUARDRAILS
Claim only verified facts
END EVIDENCE CORE-GUARDRAILS
EVIDENCE PR-POOJA-LIFEGOALS
Managed 5 teams during a documented product delivery programme.
END EVIDENCE PR-POOJA-LIFEGOALS"""
    master = tmp_path / "master.docx"
    monkeypatch.setattr(sources, "docx_text", lambda path: original)
    for name in (
        "GARAMAAL_CV_EVIDENCE_MODE", "GARAMAAL_PROFILE_DATA_SCOPE",
        "GARAMAAL_PROFILE_CV_STAGING_ISOLATED",
    ):
        monkeypatch.delenv(name, raising=False)

    class FakeDrive:
        def find(self, *_args):
            return None

    p = SimpleNamespace(
        formatting_master_file_id="", base_cv_file_id="",
        high_experience_reference_file_id="", lower_experience_reference_file_id="",
        cv_cover_letter_rules_file_id="", cover_letter_template_file_id="",
        final_projects_folder_id="", projects_folder_id="",
    )
    provider = sources.Sources(FakeDrive(), None)
    provider.profiles = {"pooja": p}
    handoff = """STAGE2_HANDOFF
cv_structure: Lower Experience
selected_professional_evidence:
  - key: PR-POOJA-LIFEGOALS
selected_projects: []
selected_achievements_qualifications_skills: []
stage3_evidence_to_retrieve_or_verify: []
"""
    out = provider.stage3("pooja", tmp_path, tmp_path / "summary.docx",
                          master, handoff, make_cover_letter=False)
    assert Path(out[0]).name == "Selected_Evidence.md"
    text = Path(out[0]).read_text()
    assert "Managed 5 teams" in text and "CORE-GUARDRAILS" in text
    assert provider.last_profile_evidence_audit is None
    assert not (tmp_path / "Profile_Evidence_Comparison.json").exists()


def test_profile_package_keeps_mandatory_drive_core_sections(tmp_path):
    base = """# SELECTED EVIDENCE
## CORE-CHRONOLOGY
J.P. Nugent July 2026 to current.

## CORE-CREDENTIALS
MSc Finance and verified qualifications.

## CORE-GUARDRAILS
Do not treat temporary support as permanent investment authority.

## PR-POOJA-LIFEGOALS
Selected original work.
"""
    profile_package = select_evidence(profile(), [ID], candidate="pooja").package
    joined = preserve_drive_core(profile_package, base, "pooja")
    assert "PINNED GARMAAL PROFILE" in joined
    assert "MSc Finance and verified qualifications" in joined
    assert "Do not treat temporary support" in joined
    assert "Managed 5 teams" in joined
    with pytest.raises(ProfileEvidenceError, match="CORE-GUARDRAILS"):
        preserve_drive_core(profile_package, base.replace("CORE-GUARDRAILS", "NO-GUARDRAILS"), "pooja")


def test_profile_keyword_tags_require_literal_original_source_support():
    p = profile()
    p["records"][0]["tags"] = ["project management", "Power BI", "5 teams"]
    result = select_evidence(p, [ID], candidate="pooja")
    assert "5 teams" in result.package
    assert "Power BI" not in result.package
    assert "project management" not in result.package


def test_staging_cutover_uses_profile_selected_package_and_retains_drive_core(tmp_path, monkeypatch):
    from automate_cv import profile_cv_adapter
    original = """CANDIDATE KEY pooja
EVIDENCE CORE-CHRONOLOGY
Career chronology 2026.
END EVIDENCE CORE-CHRONOLOGY
EVIDENCE CORE-CREDENTIALS
MSc Finance.
END EVIDENCE CORE-CREDENTIALS
EVIDENCE CORE-GUARDRAILS
No invented outcomes or qualifications.
END EVIDENCE CORE-GUARDRAILS
EVIDENCE PR-POOJA-LIFEGOALS
Managed 5 teams during a documented product delivery programme.
END EVIDENCE PR-POOJA-LIFEGOALS"""
    class FakeDrive:
        def find(self, *_args):
            return None
    p = SimpleNamespace(
        formatting_master_file_id="", base_cv_file_id="",
        high_experience_reference_file_id="", lower_experience_reference_file_id="",
        cv_cover_letter_rules_file_id="", cover_letter_template_file_id="",
        final_projects_folder_id="", projects_folder_id="",
    )
    provider = sources.Sources(FakeDrive(), None)
    provider.profiles = {"pooja": p}
    monkeypatch.setattr(sources, "docx_text", lambda path: original)
    monkeypatch.setattr(profile_cv_adapter, "profile_evidence_mode", lambda: "profile")
    evidence = select_evidence(profile(), [ID], candidate="pooja")
    monkeypatch.setattr(profile_cv_adapter, "prepare_evidence",
                        lambda candidate, ids, workdir: ("profile", evidence))
    handoff = """STAGE2_HANDOFF
cv_structure: Lower Experience
selected_professional_evidence:
  - key: PR-POOJA-LIFEGOALS
selected_projects: []
selected_achievements_qualifications_skills: []
stage3_evidence_to_retrieve_or_verify: []
"""
    paths = provider.stage3("pooja", tmp_path, tmp_path / "summary.docx",
                            tmp_path / "master.docx", handoff)
    selected = Path(paths[0]).read_text()
    retained = (tmp_path / "Drive_Selected_Evidence.md").read_text()
    assert "PINNED GARMAAL PROFILE" in selected
    assert "No invented outcomes" in selected
    assert "Career chronology 2026" in selected
    assert "Generated from MASTER EVIDENCE BANK" in retained
    assert provider.last_profile_evidence_audit["revision"] == 7
