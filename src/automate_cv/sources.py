import re
from pathlib import Path

from docx import Document
from docx.document import Document as _Document
from docx.table import Table, _Cell
from docx.text.paragraph import Paragraph

from .profiles import profiles


# Stable evidence keys in SUMMARY DOC map to exact section boundaries in the
# detailed MASTER EVIDENCE BANK. Keeping the map deterministic means Stage 3
# receives only evidence Stage 2 actually selected, without another model call.
_EVIDENCE_MARKERS = {
    'PR-TAXLINK-CLIENT': ('Client-facing responsibilities', 'Ireland-India team coordination'),
    'PR-TAXLINK-COORD': ('Ireland-India team coordination', 'Revenue and compliance liaison'),
    'PR-TAXLINK-REVENUE': ('Revenue and compliance liaison', 'Positioning for applications:'),
    'PR-EY-FAR': ('1. Functional analysis, FAR interviews and value-chain assessment', '2. Economic benchmarking and comparable-company analysis'),
    'PR-EY-BENCH': ('2. Economic benchmarking and comparable-company analysis', '3. Transfer-pricing documentation and compliance'),
    'PR-EY-DOC': ('3. Transfer-pricing documentation and compliance', '4. DEMPE, intangibles and valuation-related work'),
    'PR-EY-DEMPE': ('4. DEMPE, intangibles and valuation-related work', '5. Financial transactions and cross-border advisory'),
    'PR-EY-FINTRANS': ('5. Financial transactions and cross-border advisory', '6. Controversy, litigation and tax-authority support'),
    'PR-EY-CONTROVERSY': ('6. Controversy, litigation and tax-authority support', '7. Industry research, analysis and client presentations'),
    'PR-EY-RESEARCH': ('7. Industry research, analysis and client presentations', '8. Go-to-market strategy and business development'),
    'PR-EY-GTM': ('8. Go-to-market strategy and business development', '9. Project delivery, automation and leadership'),
    'PR-EY-DELIVERY': ('9. Project delivery, automation and leadership', 'FREELANCE ACCOUNTING & TAX SUPPORT'),
    'PR-FREELANCE-TAX': ('FREELANCE ACCOUNTING & TAX SUPPORT', 'SELECTED FINANCE, VALUATION AND TRANSACTION PROJECTS'),
    'FIN-ALPHA': ('Alpha FMC / Bridgepoint - Independent PE, Credit and FDD Analysis', 'Advanced Treasury and Financial Engineering'),
    'FIN-ADV-TREASURY': ('Advanced Treasury and Financial Engineering', 'Other academic modelling and valuation work'),
    'FIN-ACADEMIC-MODELLING': ('Other academic modelling and valuation work', 'SELECTED DELIVERABLES PRODUCED'),
}


def _iter_blocks(parent):
    """Yield paragraphs/tables in their real DOCX order."""
    if isinstance(parent, _Document):
        parent_elm = parent.element.body
    elif isinstance(parent, _Cell):
        parent_elm = parent._tc
    else:
        raise TypeError(f'Unsupported DOCX parent: {type(parent)!r}')

    for child in parent_elm.iterchildren():
        if child.tag.endswith('}p'):
            yield Paragraph(child, parent)
        elif child.tag.endswith('}tbl'):
            yield Table(child, parent)


def docx_text(path):
    """Extract readable DOCX text while preserving paragraph/table order."""
    doc = Document(path)
    parts = []
    for block in _iter_blocks(doc):
        if isinstance(block, Paragraph):
            text = block.text.strip()
            if text:
                parts.append(text)
        else:
            for row in block.rows:
                text = ' | '.join(cell.text.strip() for cell in row.cells).strip()
                if text:
                    parts.append(text)
    return '\n'.join(parts)


def mentioned_files(text):
    endings = ('.docx', '.doc', '.pdf', '.xlsx', '.xls', '.md', '.txt')
    found = []
    for raw in text.replace('`', ' ').replace('“', ' ').replace('”', ' ').splitlines():
        line = raw.strip().strip('* -')
        for ending in endings:
            pos = line.lower().find(ending)
            if pos >= 0:
                candidate = line[: pos + len(ending)].split(':')[-1].strip(' "')
                if candidate and candidate not in found:
                    found.append(candidate)
    return found


def _handoff_section(text, start_field, end_field=None):
    start = re.search(rf'(?m)^{re.escape(start_field)}\s*:\s*.*$', text)
    if not start:
        return ''
    tail = text[start.start():]
    if end_field:
        end = re.search(rf'(?m)^{re.escape(end_field)}\s*:\s*.*$', tail[start.end() - start.start():])
        if end:
            return tail[: start.end() - start.start() + end.start()]
    return tail


def selected_evidence_ids(stage2_handoff):
    """Return only evidence IDs Stage 2 selected or explicitly asked Stage 3 to verify.

    This deliberately ignores IDs that appear only in exclusions/do-not-claim so
    the selected-evidence bundle cannot accidentally reintroduce rejected evidence.
    """
    text = str(stage2_handoff or '')
    selected = []

    professional = _handoff_section(text, 'selected_professional_evidence', 'selected_projects')
    projects = _handoff_section(text, 'selected_projects', 'selected_achievements_qualifications_skills')
    verification = _handoff_section(text, 'stage3_evidence_to_retrieve_or_verify')

    for section in (professional, projects, verification):
        for match in re.finditer(r'\b(?:PR-[A-Z0-9-]+|FIN-[A-Z0-9-]+|P\d{2})\b', section):
            key = match.group(0)
            if key not in selected:
                selected.append(key)
    return selected


def selected_cv_structure(stage2_handoff):
    match = re.search(r'(?im)^cv_structure\s*:\s*["\']?([^\n"\']+)', str(stage2_handoff or ''))
    if not match:
        raise RuntimeError('STAGE2_HANDOFF is missing cv_structure.')
    value = match.group(1).strip().lower().replace('_', ' ')
    if 'high experience' in value:
        return 'high'
    if 'lower experience' in value or 'low experience' in value:
        return 'lower'
    raise RuntimeError(f'Unsupported cv_structure in STAGE2_HANDOFF: {match.group(1).strip()}')


def _slice_exact(text, start_marker, end_marker=None):
    lines = str(text).splitlines()
    start_index = next((i for i, line in enumerate(lines) if line.strip() == start_marker), None)
    if start_index is None:
        # A few source headings include punctuation/casing variants. A unique
        # prefix fallback is deterministic while still failing closed on ambiguity.
        candidates = [i for i, line in enumerate(lines) if line.strip().startswith(start_marker)]
        if len(candidates) != 1:
            raise RuntimeError(f'Could not uniquely locate evidence section: {start_marker}')
        start_index = candidates[0]

    end_index = len(lines)
    if end_marker:
        for i in range(start_index + 1, len(lines)):
            if lines[i].strip() == end_marker or lines[i].strip().startswith(end_marker):
                end_index = i
                break
        else:
            raise RuntimeError(
                f'Could not locate end of evidence section {start_marker!r}: {end_marker!r}'
            )
    return '\n'.join(lines[start_index:end_index]).strip()


def _project_block(master_text, project_id):
    number = int(project_id[1:])
    if not 1 <= number <= 26:
        raise RuntimeError(f'Unsupported project evidence ID: {project_id}')

    if number <= 11:
        anchor = 'PART I — PRIORITY 1: AUTHORITATIVE FINAL SUBMISSIONS'
        terminal = 'PART II — PRIORITY 2: GENUINELY ADDITIONAL PROJECTS FROM THE PROJECTS FOLDER'
    else:
        anchor = 'PART II — PRIORITY 2: GENUINELY ADDITIONAL PROJECTS FROM THE PROJECTS FOLDER'
        terminal = 'PART III — CONSOLIDATED HARD-SKILL MAP'

    lines = str(master_text).splitlines()
    anchor_index = next((i for i, line in enumerate(lines) if line.strip() == anchor), None)
    if anchor_index is None:
        raise RuntimeError(f'Master Evidence Bank project anchor missing: {anchor}')

    heading_re = re.compile(rf'^{number}\.\s+')
    start_index = next(
        (i for i in range(anchor_index + 1, len(lines)) if heading_re.match(lines[i].strip())),
        None,
    )
    if start_index is None:
        raise RuntimeError(f'Could not locate {project_id} in Master Evidence Bank.')

    next_heading = re.compile(rf'^{number + 1}\.\s+') if number < 26 else None
    end_index = len(lines)
    for i in range(start_index + 1, len(lines)):
        line = lines[i].strip()
        if line == terminal or (next_heading and next_heading.match(line)):
            end_index = i
            break
    return '\n'.join(lines[start_index:end_index]).strip()


def build_selected_evidence(master_text, stage2_handoff, output_path):
    """Write the minimum detailed Master Bank evidence package for Stage 3."""
    ids = selected_evidence_ids(stage2_handoff)
    if not ids:
        raise RuntimeError(
            'STAGE2_HANDOFF selected no evidence IDs; refusing to send the full Master Evidence Bank.'
        )

    sections = []

    # Core chronology and credentials are required by both approved one-page CV
    # structures and are small enough to include without reopening evidence search.
    core_chronology = _slice_exact(master_text, 'CAREER OVERVIEW', 'EXPERIENCE SCOPE AT A GLANCE')
    credentials = _slice_exact(
        master_text,
        'EDUCATION, CREDENTIALS AND RECOGNITION',
        'HOW THIS MASTER DOCUMENT SHOULD BE USED',
    )
    sections.append(('CORE-CHRONOLOGY', core_chronology))
    sections.append(('CORE-CREDENTIALS', credentials))

    for evidence_id in ids:
        if evidence_id.startswith('P') and evidence_id[1:].isdigit():
            block = _project_block(master_text, evidence_id)
        else:
            markers = _EVIDENCE_MARKERS.get(evidence_id)
            if not markers:
                raise RuntimeError(
                    f'Stage 2 selected {evidence_id}, but no deterministic Master Bank locator is configured.'
                )
            block = _slice_exact(master_text, markers[0], markers[1])
        sections.append((evidence_id, block))

    output_path = Path(output_path)
    lines = [
        '# SELECTED EVIDENCE — DETERMINISTIC STAGE 3 PACKAGE',
        '',
        'Generated from MASTER EVIDENCE BANK.docx using only evidence IDs selected '
        'or explicitly marked for Stage 3 verification in STAGE2_HANDOFF.',
        'The full Master Evidence Bank remains outside the model context and is used '
        'separately for deterministic factual QA.',
        '',
        'Selected evidence IDs: ' + ', '.join(ids),
        '',
    ]
    for evidence_id, block in sections:
        lines.extend([f'## {evidence_id}', '', block, ''])

    output_path.write_text('\n'.join(lines).strip() + '\n', encoding='utf-8')
    return output_path, ids


def source_telemetry(paths):
    result = []
    for path in paths:
        path = Path(path)
        result.append(
            {
                'file': path.name,
                'bytes': path.stat().st_size,
                'suffix': path.suffix.lower(),
            }
        )
    return result


class Sources:
    def __init__(self, drive, settings):
        self.drive = drive
        self.settings = settings
        self.profiles = profiles()

    def stage2(self, candidate_key, workdir):
        """Load only the compact Summary Doc / Evidence Router for Stage 2."""
        p = self.profiles[candidate_key]
        if not p.summary_doc_file_id:
            raise RuntimeError(f'{candidate_key}: SUMMARY_DOC_FILE_ID missing.')
        path = self.drive.download_named(p.summary_doc_file_id, workdir)
        return docx_text(path), path

    def master_evidence(self, candidate_key, workdir):
        """Load the detailed factual bank for deterministic selection and final QA."""
        p = self.profiles[candidate_key]
        if not p.master_evidence_bank_file_id:
            raise RuntimeError(f'{candidate_key}: MASTER_EVIDENCE_BANK_FILE_ID missing.')
        path = self.drive.download_named(p.master_evidence_bank_file_id, workdir)
        return docx_text(path), path

    def stage3(
        self,
        candidate_key,
        workdir,
        summary_path,
        master_path,
        stage2_handoff,
        make_cover_letter=False,
    ):
        """Build the minimal Stage 3 source package.

        summary_path/master_path remain inputs for compatibility and local source
        generation, but neither full document is uploaded to Stage 3.
        """
        del summary_path  # Stage 3 must not receive the compact router by default.
        p = self.profiles[candidate_key]
        master_text = docx_text(master_path)
        selected_path, _ = build_selected_evidence(
            master_text,
            stage2_handoff,
            Path(workdir) / 'Selected_Evidence.md',
        )
        paths = [selected_path]

        # Always supply the formatting master and editable base CV.
        for file_id in (p.formatting_master_file_id, p.base_cv_file_id):
            if file_id:
                path = self.drive.download_named(file_id, workdir)
                if path not in paths:
                    paths.append(path)

        # Supply exactly one visual reference, according to Stage 2's structure decision.
        structure = selected_cv_structure(stage2_handoff)
        reference_id = (
            p.high_experience_reference_file_id
            if structure == 'high'
            else p.lower_experience_reference_file_id
        )
        if reference_id:
            path = self.drive.download_named(reference_id, workdir)
            if path not in paths:
                paths.append(path)

        # Prompt 3 already contains the CV rules. The combined CV/Cover-Letter rules
        # and any separate cover-letter template are only useful when a CL is requested.
        if make_cover_letter:
            for file_id in (p.cv_cover_letter_rules_file_id, p.cover_letter_template_file_id):
                if file_id:
                    path = self.drive.download_named(file_id, workdir)
                    if path not in paths:
                        paths.append(path)

        # If Stage 2 explicitly names an underlying project/source file for unresolved
        # verification, attach only those named files.
        candidate_project_folders = [p.final_projects_folder_id, p.projects_folder_id]
        for name in mentioned_files(stage2_handoff):
            item = self.drive.find(name, candidate_project_folders)
            if item:
                path = self.drive.download_named(item['id'], workdir)
                if path not in paths:
                    paths.append(path)
        return paths
