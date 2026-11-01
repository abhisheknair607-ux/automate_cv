"""Staging-only bridge: saved structured Profile -> existing CV Stage 3 source slot.

The actual controlled CV worker is unchanged. An explicit staging orchestrator
may wrap its Sources object with StructuredProfileStage3Sources. Default 'drive'
mode always delegates. 'compare' prepares a local sidecar; 'profile' substitutes
the selected evidence source only after separate, explicit cutover approval.
"""
from __future__ import annotations
import hashlib
import json
import os
import re
from pathlib import Path
from typing import Mapping

from standalone.profile_cv_adapter import ProfileEvidenceError

HASH = re.compile(r"^[0-9a-f]{64}$")
CANDIDATES = ("abhishek", "pooja")
IDS = re.compile(r"^(?:experience|project):[A-Za-z0-9_-]{8,64}:[A-Za-z0-9_-]{8,64}$")


def mode(environ: Mapping[str, str]) -> str:
    value = environ.get("GARAMAAL_CV_EVIDENCE_MODE", "drive").strip().lower()
    if value not in ("drive", "compare", "profile"):
        raise ProfileEvidenceError("Unknown staging CV evidence mode")
    if value == "drive":
        return value
    if environ.get("GARAMAAL_PROFILE_DATA_SCOPE") != "staging" or environ.get(
        "GARAMAAL_PROFILE_CV_STAGING_ISOLATED"
    ) != "true" or environ.get("APP_READ_ONLY") != "true":
        raise ProfileEvidenceError("Structured handoff requires isolated staging")
    if value == "profile" and environ.get("GARAMAAL_PROFILE_CV_CUTOVER_APPROVED") != "true":
        raise ProfileEvidenceError("Explicit structured Profile CV cutover approval required")
    return value


def load_package(candidate: str, workdir: str | Path, environ: Mapping[str, str]) -> dict:
    if candidate not in CANDIDATES:
        raise ProfileEvidenceError("Invalid candidate")
    root = Path(workdir).resolve()
    name = environ.get("GARAMAAL_CV_STRUCTURED_PACKAGE_FILENAME", "")
    if not re.fullmatch(r"[A-Za-z0-9_.-]{5,150}\.json", name) or ".." in name:
        raise ProfileEvidenceError("Provide a safe package filename inside the staging workdir")
    file = (root / name).resolve()
    if not file.is_relative_to(root) or not file.is_file():
        raise ProfileEvidenceError("Pinned candidate evidence handoff is missing")
    expected_hash = environ.get("GARAMAAL_CV_STRUCTURED_PACKAGE_SHA256", "")
    if not HASH.fullmatch(expected_hash):
        raise ProfileEvidenceError("SHA-256 approval for structured evidence package missing")
    raw = file.read_bytes()
    if len(raw) > 150000:
        raise ProfileEvidenceError("Structured evidence package too large")
    if hashlib.sha256(raw).hexdigest() != expected_hash:
        raise ProfileEvidenceError("Structured evidence package changed since approval")
    try:
        data = json.loads(raw)
    except (ValueError, UnicodeDecodeError) as exc:
        raise ProfileEvidenceError("Structured evidence package is not valid JSON") from exc
    if data.get("schema") != "garamaal-staging-cv-handoff-v1" or data.get("candidate") != candidate:
        raise ProfileEvidenceError("Candidate or package schema mismatch")
    revision = environ.get("GARAMAAL_CV_STRUCTURED_PINNED_REVISION_" + candidate.upper(), "")
    if not re.fullmatch(r"[1-9][0-9]{0,9}", revision) or data.get("revision") != int(revision):
        raise ProfileEvidenceError("Structured Profile revision not pinned")
    jd_digest = environ.get("GARAMAAL_CV_EXPECTED_JD_SHA256", "")
    if not HASH.fullmatch(jd_digest) or not isinstance(data.get("jdText"), str):
        raise ProfileEvidenceError("Pinned job description digest missing")
    if hashlib.sha256(data["jdText"].encode("utf-8")).hexdigest() != jd_digest or (
        data.get("jdSha256") != jd_digest
    ):
        raise ProfileEvidenceError("Job description differs from matched evidence package")
    ids = data.get("selectedIds")
    records = data.get("selectedEvidence")
    if not isinstance(ids, list) or not ids or len(ids) > 30 or not isinstance(records, list):
        raise ProfileEvidenceError("Structured CV handoff requires selected achievements")
    if len(ids) != len(set(ids)) or set(ids) != {r.get("id") for r in records if isinstance(r, dict)}:
        raise ProfileEvidenceError("Handoff record manifest does not match selection")
    for r in records:
        if not isinstance(r, dict) or not IDS.fullmatch(str(r.get("id") or "")) or (
            r.get("candidate") != candidate or r.get("eligibleForCv") is not True
            or r.get("reviewStatus") != "confirmed" or not r.get("achievementId")
        ):
            raise ProfileEvidenceError("Unapproved or mismatched Profile achievement")
        for metric in r.get("metrics") or []:
            if any(not str(metric.get(k) or "").strip() for k in ("value", "context", "evidence")):
                raise ProfileEvidenceError("Evidence package contains an unsupported number")
    if data.get("previewOnly") is not True or data.get("productionCvUnchanged") is not True:
        raise ProfileEvidenceError("Only original staging handoff manifests are accepted")
    markdown = data.get("markdown")
    if not isinstance(markdown, str) or not markdown.startswith(
        "# GARAMAAL STRUCTURED PROFILE — STAGING EVIDENCE PACKAGE"
    ) or len(markdown) > 105000:
        raise ProfileEvidenceError("Missing structured evidence package content")
    return data


def assemble(package: dict, legacy_selected_evidence: str) -> str:
    """Structured reviewed items first; original Drive evidence retained for audit."""
    if not legacy_selected_evidence.strip():
        raise ProfileEvidenceError("Mandatory Drive baseline absent")
    return (
        package["markdown"] +
        "\n## ORIGINAL GOOGLE DRIVE EVIDENCE — REFERENCE AND CLAIM CHECKS ONLY\n"
        "This section is historical reference. Do not repeat or combine unverified "
        "figures with structured achievements. Follow all original restrictions.\n\n" +
        legacy_selected_evidence + "\n"
    )


class StructuredProfileStage3Sources:
    def __init__(self, legacy_sources, *, environ: Mapping[str, str] | None = None):
        self.legacy = legacy_sources
        self.environ = os.environ if environ is None else environ
        self.last_profile_evidence_audit = None

    def __getattr__(self, key):
        return getattr(self.legacy, key)

    def stage3(self, candidate_key, workdir, summary_path, master_path,
               stage2_output, make_cover_letter=None):
        selected_mode = mode(self.environ)
        original_paths = self.legacy.stage3(
            candidate_key, workdir, summary_path, master_path, stage2_output,
            make_cover_letter=make_cover_letter
        )
        self.last_profile_evidence_audit = None
        if selected_mode == "drive":
            return original_paths
        if not original_paths:
            raise ProfileEvidenceError("Stage 3 Drive source was not produced")
        source = Path(original_paths[0])
        if source.name != "Selected_Evidence.md" or not source.is_file():
            raise ProfileEvidenceError("Selected_Evidence.md is missing")
        p = load_package(candidate_key, workdir, self.environ)
        self.last_profile_evidence_audit = {
            "mode": selected_mode, "candidate": candidate_key,
            "revision": p["revision"], "jdSha256": p["jdSha256"],
            "approvedAchievementIds": p["selectedIds"], "driveBaselinePreserved": True
        }
        if selected_mode == "compare":
            (Path(workdir) / "Structured_Evidence_Compare.md").write_text(
                p["markdown"], encoding="utf-8"
            )
            return original_paths
        baseline = source.read_text(encoding="utf-8")
        (Path(workdir) / "Drive_Selected_Evidence.md").write_text(
            baseline, encoding="utf-8"
        )
        source.write_text(assemble(p, baseline), encoding="utf-8")
        from automate_cv.sources import source_telemetry
        self.legacy.last_stage3_telemetry = source_telemetry(original_paths)
        return original_paths
