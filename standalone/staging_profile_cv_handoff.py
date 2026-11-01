"""Staging-only adapter around the *unchanged* production Sources.stage3 method.

This module is intentionally outside src/automate_cv: existing production
workflow files and their strict CI protection remain unchanged. A staging
orchestrator may explicitly wrap an existing Sources instance with this proxy.
Default drive mode delegates byte-for-byte to the existing method.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Mapping

from standalone.profile_cv_adapter import (
    ProfileEvidenceError, prepare_evidence, preserve_drive_core,
    profile_evidence_mode,
)


class ProfileStage3Sources:
    def __init__(self, legacy_sources, *, environ: Mapping[str, str] | None = None,
                 transport=None):
        self.legacy = legacy_sources
        self.environ = os.environ if environ is None else environ
        self.transport = transport
        self.last_profile_evidence_audit = None

    def __getattr__(self, item):
        return getattr(self.legacy, item)

    def stage3(self, candidate_key, workdir, summary_path, master_path,
               stage2_output, make_cover_letter=None):
        from automate_cv.sources import selected_evidence_ids

        mode = profile_evidence_mode(self.environ)
        # Always run the exact existing Drive source builder first. It performs
        # deterministic Stage 2 evidence-ID checks and provides the mandatory
        # chronology/credentials/guardrail material for transitional staging.
        paths = self.legacy.stage3(
            candidate_key, workdir, summary_path, master_path,
            stage2_output, make_cover_letter=make_cover_letter,
        )
        self.last_profile_evidence_audit = None
        if mode == "drive":
            return paths
        if not paths:
            raise ProfileEvidenceError("Legacy Stage 3 produced no source files")
        evidence_path = Path(paths[0])
        if evidence_path.name != "Selected_Evidence.md" or not evidence_path.is_file():
            raise ProfileEvidenceError("Legacy selected evidence source is unavailable")
        selected_ids = selected_evidence_ids(stage2_output)
        result_mode, profile = prepare_evidence(
            candidate_key, selected_ids, workdir,
            environ=self.environ, transport=self.transport,
        )
        if result_mode != mode:
            raise ProfileEvidenceError("Unexpected Profile source mode mismatch")
        self.last_profile_evidence_audit = {"mode": mode, **profile.summary()}
        if mode == "compare":
            # The exact original Drive file is still first in the model inputs.
            return paths

        # Profile cutover is already explicitly staging-gated in prepare_evidence.
        # Keep the Drive baseline local and append legacy core source context.
        original = evidence_path.read_text(encoding="utf-8")
        assembled = preserve_drive_core(profile.package, original, candidate_key)
        baseline = Path(workdir) / "Drive_Selected_Evidence.md"
        baseline.write_text(original, encoding="utf-8")
        evidence_path.write_text(assembled, encoding="utf-8")
        # The legacy provider calculated source telemetry before staging
        # substitution. Recompute it so audit byte sizes describe the actual
        # package Stage 3 receives, not its saved Drive baseline.
        from automate_cv.sources import source_telemetry
        self.legacy.last_stage3_telemetry = source_telemetry(paths)
        return paths
