"""Read-only, pinned Garamaal Profile evidence for the CV worker.

No network access or change to the Stage 3 source occurs in the default 'drive'
mode. Staging compare is observational. Staging profile requires a second
deliberate approval; failure never silently falls back to another candidate
or an out-of-date/unverified profile.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping

SCOPED_COLLECTION = "garamaalProfilesStagingV1"
HEX64 = re.compile(r"^[0-9a-f]{64}$")
PROJECT_ID = re.compile(r"^[a-z][a-z0-9-]{4,62}$")
ALLOWED_CANDIDATES = ("abhishek", "pooja")
INELIGIBLE_SECTIONS = {"reference", "guardrails", "other"}
NUMBER = re.compile(
    r"(?:[€£$]\s?\d[\d,.]*(?:\s?(?:k|m|bn|million|billion))?"
    r"|\b\d[\d,.]*\s?%|\b\d[\d,.]*\+?\s?(?:companies|clients|projects|"
    r"transactions|years|months|people|teams|cases|countries|stakeholders|"
    r"employees|files)\b|\b\d+(?:[,.]\d+)*(?:\s?(?:k|m|bn))?\+?(?=$|[^\w]))",
    re.I,
)


class ProfileEvidenceError(RuntimeError):
    """Fail-closed profile access, provenance, or verification failure."""


def profile_evidence_mode(environ: Mapping[str, str] | None = None) -> str:
    env = os.environ if environ is None else environ
    mode = env.get("GARAMAAL_CV_EVIDENCE_MODE", "drive").strip().lower()
    if mode not in {"drive", "compare", "profile"}:
        raise ProfileEvidenceError("Unknown CV evidence mode; expected drive/compare/profile")
    if mode == "drive":
        return mode
    if env.get("GARAMAAL_PROFILE_DATA_SCOPE") != "staging" or env.get(
        "GARAMAAL_PROFILE_CV_STAGING_ISOLATED"
    ) != "true":
        raise ProfileEvidenceError("Profile CV evidence is allowed only in explicitly isolated staging")
    if mode == "profile" and env.get("GARAMAAL_PROFILE_CV_CUTOVER_APPROVED") != "true":
        raise ProfileEvidenceError("Profile CV source cutover was not approved")
    return mode


def _pinned_config(candidate: str, environ: Mapping[str, str]) -> tuple[str, str, int]:
    if candidate not in ALLOWED_CANDIDATES:
        raise ProfileEvidenceError("Unrecognised candidate")
    suffix = candidate.upper()
    owner = environ.get(f"GARAMAAL_PROFILE_CV_OWNER_DIGEST_{suffix}", "")
    project = environ.get("GARAMAAL_PROFILE_CV_GCP_PROJECT", "")
    raw = environ.get(f"GARAMAAL_PROFILE_CV_REVISION_{suffix}", "")
    if not HEX64.fullmatch(owner):
        raise ProfileEvidenceError("Candidate-specific owner digest missing or malformed")
    if not PROJECT_ID.fullmatch(project):
        raise ProfileEvidenceError("Staging Firestore project not explicitly configured")
    if not re.fullmatch(r"[1-9][0-9]{0,9}", raw):
        raise ProfileEvidenceError("Pinned positive Profile revision missing")
    return project, owner, int(raw)


def _firestore_value(raw: dict) -> Any:
    """Decode only the REST value shapes needed for private read-only snapshots."""
    if not isinstance(raw, dict):
        raise ProfileEvidenceError("Malformed Firestore value")
    if "stringValue" in raw:
        return raw["stringValue"]
    if "integerValue" in raw:
        return int(raw["integerValue"])
    if "doubleValue" in raw:
        return float(raw["doubleValue"])
    if "booleanValue" in raw:
        return bool(raw["booleanValue"])
    if "nullValue" in raw:
        return None
    if "timestampValue" in raw:
        return str(raw["timestampValue"])
    if "mapValue" in raw:
        return {k: _firestore_value(v) for k, v in raw["mapValue"].get("fields", {}).items()}
    if "arrayValue" in raw:
        return [_firestore_value(v) for v in raw["arrayValue"].get("values", [])]
    raise ProfileEvidenceError("Unsupported Firestore value type")


def _document(payload: dict) -> dict:
    if not isinstance(payload, dict) or not isinstance(payload.get("fields"), dict):
        raise ProfileEvidenceError("Invalid Firestore profile document")
    return {k: _firestore_value(v) for k, v in payload["fields"].items()}


def _read_json_document(path: str, *, transport=None) -> dict:
    """AuthorizedSession via Workload Identity / ADC. No user tokens or API keys."""
    if transport is None:
        import google.auth
        from google.auth.transport.requests import AuthorizedSession
        credentials, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/datastore"])
        transport = AuthorizedSession(credentials)
    response = transport.get("https://firestore.googleapis.com/v1/" + path, timeout=20)
    if response.status_code != 200:
        raise ProfileEvidenceError(
            f"Staging Firestore profile read failed with HTTP {response.status_code}"
        )
    return _document(response.json())


def read_pinned_snapshot(
    candidate: str, *, environ: Mapping[str, str] | None = None, transport=None
) -> dict:
    env = os.environ if environ is None else environ
    if profile_evidence_mode(env) == "drive":
        raise ProfileEvidenceError("Drive mode does not access Firestore")
    project, owner, revision = _pinned_config(candidate, env)
    root = (
        f"projects/{project}/databases/(default)/documents/"
        f"{SCOPED_COLLECTION}/{owner}/candidates/{candidate}"
    )
    # Both reads are explicitly limited to the configured candidate/document.
    current = _read_json_document(root, transport=transport)
    version = _read_json_document(
        f"{root}/versions/{revision:010d}", transport=transport
    )
    if current.get("candidate") != candidate or not current.get("imported"):
        raise ProfileEvidenceError("Current Firestore candidate ownership mismatch")
    if not isinstance(current.get("revision"), int) or current["revision"] < revision:
        raise ProfileEvidenceError("Pinned Profile revision is newer than the current document")
    snapshot = version.get("profile")
    if (
        version.get("candidate") != candidate
        or version.get("revision") != revision
        or not isinstance(snapshot, dict)
        or snapshot.get("candidate") != candidate
        or snapshot.get("revision") != revision
        or not snapshot.get("imported")
        or version.get("recordCount") != len(snapshot.get("records", []))
    ):
        raise ProfileEvidenceError("Pinned revision ownership or metadata mismatch")
    if snapshot.get("historySchema") != 5:
        raise ProfileEvidenceError("Profile snapshot lacks an auditable history schema")
    source_hashes = version.get("sourceHashes")
    if not isinstance(source_hashes, list):
        raise ProfileEvidenceError("Pinned snapshot is missing source hashes")
    observed = [{"kind": s.get("kind"), "sha256": s.get("sha256")}
                for s in snapshot.get("sources", [])]
    if source_hashes != observed or not any(s["kind"] == "master" for s in observed):
        raise ProfileEvidenceError("Profile source manifest differs from pinned version")
    return snapshot


def _claim_numbers(text: str) -> set[str]:
    return {re.sub(r"[\s,]+", "", match.group(0)).lower()
            for match in NUMBER.finditer(text)}



# Conservative independent Python check for reused numbers with incompatible
# outcome categories. JS verifies on save, but CV staging must recheck pinned
# snapshots rather than trusting historic client-side review flags alone.
_CONTEXT_LABELS = {
    "client-outcome": re.compile(r"\b(?:satisfaction|retention|referrals?|nps|customer experience)\b", re.I),
    "revenue": re.compile(r"\b(?:revenue|profits?|earnings|margins?|sales|ebitda|turnover)\b", re.I),
    "cost": re.compile(r"\b(?:costs?|expenses?|savings?|spend|expenditure|budget)\b", re.I),
    "speed": re.compile(r"\b(?:turnaround|processing time|hours?|days?|minutes?|deadline)\b", re.I),
    "quality": re.compile(r"\b(?:accuracy|errors?|quality|productivity|efficiency|rework)\b", re.I),
    "investments": re.compile(r"\b(?:portfolios?|assets?|aum|funds?|investments?|capital|returns?|valuations?)\b", re.I),
    "compliance": re.compile(r"\b(?:risk|compliance|exceptions?|audits?|regulatory|controls?|breaches?)\b", re.I),
    "scope": re.compile(r"\b(?:companies|clients|customers|teams?|people|projects?|transactions?|cases?|countries|stakeholders|files)\b", re.I),
}


def _numeric_contexts(text: str) -> dict[str, list[set[str]]]:
    contexts: dict[str, list[set[str]]] = {}
    for sentence in re.split(r"(?<=[.!?])\s+|\n+", text):
        labels = {name for name, pattern in _CONTEXT_LABELS.items()
                  if pattern.search(sentence)}
        for match in NUMBER.finditer(sentence):
            key = re.sub(r"[\s,]+", "", match.group(0)).lower()
            contexts.setdefault(key, []).append(labels)
    return contexts


def incompatible_numeric_context(claim: str, original: str) -> bool:
    """Flag *known* outcome mismatches, not certify semantic equivalence."""
    reference = _numeric_contexts(original)
    for value, claim_contexts in _numeric_contexts(claim).items():
        possible = reference.get(value, [])
        if not possible:
            return True
        for required in claim_contexts:
            # Unclassified context still requires review, but cannot be
            # automatically called a known mismatch by this narrow detector.
            if required and all(found and not (required & found) for found in possible):
                return True
    return False


def _source_id(record: dict) -> str | None:
    src = record.get("source") or {}
    key = src.get("evidenceKey") or ""
    if not key:
        locator = str(src.get("locator") or "")
        match = re.search(r"\b(?:PR-[A-Z0-9-]+|FIN-[A-Z0-9-]+|P[0-9]{2})\b", locator)
        key = match.group(0) if match else ""
    return key if re.fullmatch(r"(?:PR-[A-Z0-9-]+|FIN-[A-Z0-9-]+|P[0-9]{2})", key) else None


def _eligible(record: dict, master_id: str) -> bool:
    source = record.get("source") or {}
    if (source.get("kind") != "master" or source.get("fileId") != master_id
            or record.get("cvEligible") is not True
            or record.get("status") != "verified"
            or record.get("classificationReviewed") is not True
            or record.get("sourceMissing") or record.get("sourceSuperseded")
            or record.get("sourceDrift") or record.get("duplicateOf")
            or record.get("section") in INELIGIBLE_SECTIONS):
        return False
    original = record.get("originalText")
    if not isinstance(original, str) or len(original.strip()) < 5:
        return False
    if record.get("metrics") and record.get("metricsReviewed") is not True:
        return False
    # JS-side checks are not enough: independently reject new numbers in any
    # optional STAR, CV bullet or working-fact narrative.
    reviewed = [str(record.get("workingText") or ""),
                str(record.get("cvBullet") or "")]
    reviewed.extend(str(v or "") for v in (record.get("star") or {}).values())
    if not _claim_numbers("\n".join(reviewed)).issubset(_claim_numbers(original)):
        return False
    if any(incompatible_numeric_context(claim, original) for claim in reviewed if claim):
        return False
    return True


@dataclass(frozen=True)
class EvidenceSelection:
    candidate: str
    revision: int
    selected_ids: tuple[str, ...]
    accepted_ids: tuple[str, ...]
    missing_ids: tuple[str, ...]
    source_digests: tuple[str, ...]
    package: str

    def summary(self) -> dict:
        return {
            "candidate": self.candidate, "revision": self.revision,
            "selected": list(self.selected_ids), "accepted": list(self.accepted_ids),
            "missing": list(self.missing_ids), "sourceDigests": list(self.source_digests),
        }


def select_evidence(
    snapshot: dict, selected_ids: list[str] | tuple[str, ...], *, candidate: str
) -> EvidenceSelection:
    if candidate not in ALLOWED_CANDIDATES or snapshot.get("candidate") != candidate:
        raise ProfileEvidenceError("Candidate does not match pinned Profile evidence")
    revision = snapshot.get("revision")
    if not isinstance(revision, int) or revision < 1:
        raise ProfileEvidenceError("Invalid pinned revision")
    if not isinstance(selected_ids, (list, tuple)) or not selected_ids:
        raise ProfileEvidenceError("Stage 2 selected no evidence IDs")
    if len(selected_ids) > 80 or len(set(selected_ids)) != len(selected_ids):
        raise ProfileEvidenceError("Duplicate or excessive Stage 2 IDs")
    for key in selected_ids:
        if not isinstance(key, str) or not re.fullmatch(
            r"(?:PR-[A-Z0-9-]+|FIN-[A-Z0-9-]+|P[0-9]{2})", key
        ):
            raise ProfileEvidenceError("Malformed Stage 2 evidence ID")
        if candidate == "pooja" and not key.startswith(("PR-POOJA-", "FIN-POOJA-")):
            raise ProfileEvidenceError("Pooja Stage 2 selected another candidate's evidence")
        if candidate == "abhishek" and "-POOJA-" in key:
            raise ProfileEvidenceError("Another candidate's evidence is unavailable")
    sources = snapshot.get("sources") or []
    masters = [s for s in sources if s.get("kind") == "master"]
    if len(masters) != 1 or not isinstance(masters[0].get("sha256"), str):
        raise ProfileEvidenceError("Exactly one pinned Master Evidence Bank is required")
    master = masters[0]
    master_id = master.get("fileId")
    if not isinstance(master_id, str) or len(master_id) < 15:
        raise ProfileEvidenceError("Missing authenticated Master Bank provenance")
    by_key: dict[str, list[dict]] = {}
    for record in snapshot.get("records") or []:
        if not isinstance(record, dict):
            raise ProfileEvidenceError("Malformed Profile record")
        key = _source_id(record)
        if key and _eligible(record, master_id):
            by_key.setdefault(key, []).append(record)
    accepted, missing, body = [], [], [
        "# PINNED GARMAAL PROFILE — VERIFIED STAGE 3 EVIDENCE",
        "",
        f"Candidate: {candidate}",
        f"Profile revision: {revision}",
        f"Source master SHA-256: {master['sha256']}",
        "This is a reviewed evidence package, not permission to invent missing facts.",
        "",
    ]
    for key in selected_ids:
        matches = by_key.get(key, [])
        if len(matches) != 1:
            missing.append(key)
            continue
        record = matches[0]
        src = record["source"]
        accepted.append(key)
        body.extend([
            f"## {key}", "",
            f"Record ID: {record['id']}",
            f"Original evidence locator: {src.get('locator') or key}",
            f"Original source file: {src['fileId']}",
            f"Original source line range: {src.get('lineStart')}–{src.get('lineEnd')}",
            "Original evidence (immutable):",
            str(record["originalText"]).strip(), "",
        ])
        star = record.get("star") or {}
        if any(str(star.get(f) or "").strip() for f in ("situation", "task", "action", "result")):
            body.append("Human-reviewed STAR drafts (verify against original text):")
            for field in ("situation", "task", "action", "result"):
                if str(star.get(field) or "").strip():
                    body.append(f"{field.title()}: {star[field]}")
            body.append("")
        if str(record.get("cvBullet") or "").strip():
            body.extend(["Reviewed CV bullet draft:", str(record["cvBullet"]), ""])
        if record.get("tags"):
            # Manually typed keywords are not automatically proven skills.
            # Require literal source support before including a candidate tag.
            supported_tags = [str(tag) for tag in record["tags"]
                              if isinstance(tag, str) and len(tag) <= 60
                              and re.search(r"(?<!\w)" + re.escape(tag)
                                            + r"(?!\w)", record["originalText"], re.I)]
            if supported_tags:
                body.extend(["Source-supported reviewed tags (not automatic qualifications):",
                             ", ".join(supported_tags), ""])
    body.extend([
        "## STAGE 2 EVIDENCE COVERAGE",
        f"Selected: {', '.join(selected_ids)}",
        f"Verified and included: {', '.join(accepted) or 'none'}",
        f"Missing or unverified: {', '.join(missing) or 'none'}",
    ])
    return EvidenceSelection(
        candidate, revision, tuple(selected_ids), tuple(accepted),
        tuple(missing), tuple(s["sha256"] for s in sources),
        "\n".join(body).strip() + "\n",
    )


def preserve_drive_core(profile_package: str, drive_package: str, candidate: str) -> str:
    """Keep mandatory legacy core policy and chronology during staging cutover.

    Stage 2 continues to use Drive's Summary Router, so the transitional
    Profile package must retain the exact Drive-derived chronology,
    credentials and claim guardrails that the historical Stage 3 received.
    Stage 7 can replace these with separately reviewed Profile-owned records.
    """
    required = ("CORE-CHRONOLOGY", "CORE-CREDENTIALS", "CORE-GUARDRAILS") if candidate == "pooja" else (
        "CORE-CHRONOLOGY", "CORE-CREDENTIALS"
    )
    blocks = {}
    text = str(drive_package)
    for key in required:
        match = re.search(r"(?ms)^## " + re.escape(key) +
                          r"\s*\n(.*?)(?=^## |\Z)", text)
        if not match or len(match.group(1).strip()) < 5:
            raise ProfileEvidenceError(
                "Original Drive Stage 3 core context is missing: " + key
            )
        blocks[key] = match.group(1).strip()
    lines = [
        profile_package.rstrip(),
        "",
        "## TRANSITIONAL DRIVE CORE CONTEXT — REFERENCE AND GUARDRAILS",
        "These original sections are included unchanged from the established "
        "Drive evidence package. They do not represent newly approved Profile "
        "STAR outcomes or supplementary quantified claims.",
    ]
    for key in required:
        lines.extend([f"### {key}", blocks[key], ""])
    return "\n".join(lines).strip() + "\n"


def prepare_evidence(
    candidate: str, selected_ids: list[str], workdir: str | Path,
    *, environ: Mapping[str, str] | None = None, transport=None,
) -> tuple[str, EvidenceSelection]:
    env = os.environ if environ is None else environ
    mode = profile_evidence_mode(env)
    if mode == "drive":
        raise ProfileEvidenceError("Default Drive mode must bypass the Profile adapter")
    snapshot = read_pinned_snapshot(candidate, environ=env, transport=transport)
    evidence = select_evidence(snapshot, selected_ids, candidate=candidate)
    root = Path(workdir)
    if mode == "profile" and evidence.missing_ids:
        raise ProfileEvidenceError(
            "Pinned Profile lacks reviewed Stage 2 evidence IDs: "
            + ", ".join(evidence.missing_ids)
        )
    # Comparison keeps source text local and writes only a list of selected ID
    # coverage for audit. Never upload comparison output to CV generation.
    if mode == "compare":
        comparison = root / "Profile_Evidence_Comparison.json"
        comparison.write_text(
            json.dumps(evidence.summary(), sort_keys=True, indent=2) + "\n",
            encoding="utf-8",
        )
    return mode, evidence
