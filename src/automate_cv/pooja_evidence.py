"""Pooja's ID based evidence package; independent of Abhishek's section map."""

import re
from pathlib import Path

from .sources import stage2_handoff_only


ID = r'(?:PR|PROJ|QUAL|EDU|SKILL|ACH)-[A-Z0-9]+(?:-[A-Z0-9]+)*'
HEADING = re.compile(rf'^EVIDENCE_ID:\s*({ID})\s*$', re.MULTILINE)


def selected_ids(handoff):
    text = stage2_handoff_only(handoff)
    fields = ('selected_professional_evidence', 'selected_projects',
              'selected_achievements_qualifications_skills',
              'stage3_evidence_to_retrieve_or_verify')
    result = []
    for field in fields:
        match = re.search(rf'(?m)^{field}\s*:', text)
        if not match:
            continue
        tail = text[match.end():]
        end = re.search(r'(?m)^[a-z][a-z0-9_]*\s*:', tail)
        section = tail[:end.start()] if end else tail
        for evidence_id in re.findall(rf'(?<![A-Z0-9-]){ID}(?![A-Z0-9-])', section):
            if evidence_id not in result:
                result.append(evidence_id)
    return result


def build_selected_evidence(master_text, handoff, output_path):
    ids = selected_ids(handoff)
    if not ids:
        raise RuntimeError('Pooja STAGE2_HANDOFF selected no evidence IDs.')
    matches = list(HEADING.finditer(master_text))
    blocks = {}
    for index, match in enumerate(matches):
        evidence_id = match.group(1)
        if evidence_id in blocks:
            raise RuntimeError(f'Duplicate Pooja evidence ID: {evidence_id}')
        end = matches[index + 1].start() if index + 1 < len(matches) else len(master_text)
        block = master_text[match.start():end].strip()
        if not master_text[match.end():end].strip():
            raise RuntimeError(f'Empty Pooja evidence ID: {evidence_id}')
        blocks[evidence_id] = block
    missing = [evidence_id for evidence_id in ids if evidence_id not in blocks]
    if missing:
        raise RuntimeError('Pooja Master Evidence Bank is missing selected IDs: ' + ', '.join(missing))
    path = Path(output_path)
    path.write_text('# SELECTED POOJA EVIDENCE\n\n' +
                    '\n\n'.join(blocks[evidence_id] for evidence_id in ids) + '\n',
                    encoding='utf-8')
    return path, ids
