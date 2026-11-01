"""Offline staging CV evidence handoff: no model calls or Google Cloud writes."""
import hashlib
import json
from pathlib import Path

import pytest

from standalone.staging_structured_cv_handoff import (
    ProfileEvidenceError, StructuredProfileStage3Sources, assemble, load_package, mode
)


def fixture(tmp_path):
    candidate = "pooja"
    jd = "Portfolio efficiency improvement for financial planning position"
    sha = hashlib.sha256(jd.encode()).hexdigest()
    one = {
        "id": "experience:job0000001:achievement000001",
        "candidate": candidate,
        "achievementId": "achievement000001",
        "reviewStatus": "confirmed",
        "eligibleForCv": True,
        "metrics": [{"value": "25%", "context": "Process efficiency",
                     "evidence": "Candidate reviewed evidence record"}]
    }
    pkg = {
        "schema": "garamaal-staging-cv-handoff-v1",
        "candidate": candidate, "revision": 4, "jdText": jd, "jdSha256": sha,
        "selectedIds": [one["id"]], "selectedEvidence": [one],
        "markdown": "# GARAMAAL STRUCTURED PROFILE — STAGING EVIDENCE PACKAGE\n"
                    "Candidate: pooja\n",
        "previewOnly": True, "productionCvUnchanged": True
    }
    path = tmp_path / "profile-matched.json"
    path.write_text(json.dumps(pkg), encoding="utf-8")
    env = {
        "GARAMAAL_CV_EVIDENCE_MODE": "compare",
        "GARAMAAL_PROFILE_DATA_SCOPE": "staging",
        "GARAMAAL_PROFILE_CV_STAGING_ISOLATED": "true",
        "APP_READ_ONLY": "true",
        "GARAMAAL_CV_STRUCTURED_PACKAGE_FILENAME": path.name,
        "GARAMAAL_CV_STRUCTURED_PACKAGE_SHA256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "GARAMAAL_CV_STRUCTURED_PINNED_REVISION_POOJA": "4",
        "GARAMAAL_CV_EXPECTED_JD_SHA256": sha,
    }
    return pkg, path, env


def test_pinned_handoff_rejects_tampering_cross_candidate_and_changed_jd(tmp_path):
    pkg, path, env = fixture(tmp_path)
    assert load_package("pooja", tmp_path, env)["revision"] == 4
    with pytest.raises(ProfileEvidenceError):
        load_package("abhishek", tmp_path, env)
    with pytest.raises(ProfileEvidenceError):
        load_package("pooja", tmp_path, {**env, "GARAMAAL_CV_EXPECTED_JD_SHA256": "0" * 64})
    path.write_text(json.dumps({**pkg, "revision": 5}), encoding="utf-8")
    with pytest.raises(ProfileEvidenceError):
        load_package("pooja", tmp_path, env)


def test_missing_numeric_context_rejected_even_with_matching_hash(tmp_path):
    pkg, path, env = fixture(tmp_path)
    pkg["selectedEvidence"][0]["metrics"][0]["evidence"] = ""
    path.write_text(json.dumps(pkg), encoding="utf-8")
    env["GARAMAAL_CV_STRUCTURED_PACKAGE_SHA256"] = hashlib.sha256(path.read_bytes()).hexdigest()
    with pytest.raises(ProfileEvidenceError, match="unsupported number"):
        load_package("pooja", tmp_path, env)


def test_default_drive_mode_never_reads_profile_package(tmp_path):
    _, _, env = fixture(tmp_path)
    assert mode({}) == "drive"
    with pytest.raises(ProfileEvidenceError):
        mode({**env, "GARAMAAL_CV_EVIDENCE_MODE": "profile"})
    original = "# SELECTED EVIDENCE\nVerified original Drive source"
    assert "Verified original Drive source" in assemble(
        {"markdown": "# GARAMAAL STRUCTURED PROFILE\n"},
        original
    )


def test_staging_compare_delegates_to_unchanged_drive_source(tmp_path):
    _, _, env = fixture(tmp_path)
    class Legacy:
        def stage3(self, candidate, workdir, summary_path, master_path,
                   stage2_output, make_cover_letter=None):
            name = Path(workdir) / "Selected_Evidence.md"
            name.write_text("Original Drive source", encoding="utf-8")
            return [name]
    legacy = Legacy()
    wrapped = StructuredProfileStage3Sources(legacy, environ=env)
    paths = wrapped.stage3("pooja", tmp_path, None, None, None)
    assert paths[0].read_text(encoding="utf-8") == "Original Drive source"
    assert (tmp_path / "Structured_Evidence_Compare.md").exists()
    assert wrapped.last_profile_evidence_audit["mode"] == "compare"
