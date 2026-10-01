"""Combine analysis without removing source rules; reuse template formatting."""
import re


_MERGE_CONTRACT = '''
# COMBINED JD ANALYSIS AND EVIDENCE SELECTION v1

Execute the two source rule sets below in one response, in this strict order.
Phase A: analyse the raw JD independently of candidate evidence. Fix employer
requirements, priorities, seniority, ownership, ATS terms, direct-experience
needs, recruiter priorities and retrieval tags before assessing the candidate.
Phase B: apply that fixed framework to the supplied candidate-only Summary
Router. Preserve every selection, ranking, allocation, exclusion, gap and
verification function in the source rules. Do not draft a CV or cover letter.
Never alter employer requirements to accommodate the candidate's experience.

This combined controller replaces only separate-call transitions and repetitive
presentation. References to the previous JD stage mean Phase A of this response.
The router is available, but must not influence Phase A. Original candidate
rules, counts, classifications and factual safeguards remain authoritative.
Do not invent evidence to meet a selection count; flag unavailable evidence.
The two phases form ONE paid analysis step. Do not request a second trigger.

## Combined output contract
Output in order:
1. Under '# JD ANALYSIS': role context/purpose/outcomes/working pattern; a requirement
   table with IDs, Critical/Strongly Preferred/Secondary priority, JD wording,
   practical responsibility/competency, evidence needed and direct-experience
   boundary; seniority/ownership, client/stakeholder relationships, grouped ATS
   terms, ideal candidate, evidence checklist, exactly five recruiter priorities,
   differentiators/interview challenges, evidence strategy and retrieval tags.
   Use the same table for overlapping responsibility and competency explanations.
2. STAGE1_HANDOFF heading followed by a fenced YAML block. Include company,
   role_title, location, team_or_function, seniority, role_family,
   cv_evidence_strategy, critical_requirement_ids,
   strongly_preferred_requirement_ids, secondary_requirement_ids,
   top_5_recruiter_priorities, ats_priority_terms, evidence_retrieval_tags,
   direct_experience_items and seniority_ownership_signals.
3. Under '# EVIDENCE SELECTION': fit summary; selected professional points/projects/
   achievements with source context, match type, strength, supported results,
   ownership/classification and verification needs; requirement coverage;
   ranked evidence with reasons; gaps/confirmation needs; exclusions with reasons;
   exact deeper-review files and what to verify; one-page allocation (definitely
   include / only if space / cover-letter-or-interview / exclude). Preserve the
   candidate source rules' selection counts and any template restrictions.
4. STAGE2_HANDOFF heading followed by a fenced YAML block using the exact field
   order below. Use existing router evidence IDs. Include all decisions needed
   downstream; the full analysis will be saved but not forwarded to Stage 3.

company:
role_title:
location:
team_or_function:
seniority:
role_family:
cv_structure:
cv_evidence_strategy:
critical_requirements: [{id: R1, need: '', selected_evidence_keys: []}]
strongly_preferred_requirements: []
selected_professional_evidence: [{key: '', requirements: [], factual_anchor: '', supported_metrics: []}]
selected_projects: [{id: '', classification: '', ownership_boundary: '', requirements: []}]
selected_achievements_qualifications_skills: []
ats_priority_terms: []
definitely_include: []
include_if_space: []
exclude_or_interview_only: []
gaps: []
do_not_claim: []
stage3_evidence_to_retrieve_or_verify: []

Do not copy empty example records. Add secondary requirements, ranking, match
strength and additional source-rule details where necessary. cv_structure must
be High Experience or Lower Experience for the existing reference selector;
the candidate's formatting master still controls the actual layout. For Pooja
the locked master sections take precedence over generic project allocation.
Keep prose compact and factual; remove repeated explanations, never decisions.
Aim for 3,000–4,500 output tokens, extending only for material coverage needs.
The fenced blocks are mandatory and must not be omitted to hit that target.
'''.strip()


def combine_analysis_prompts(prompt1, prompt2):
    """Retain source policy bodies verbatim; remove only old transition blocks."""
    bodies = []
    for text in (prompt1, prompt2):
        body = re.split(r'(?m)^# WORKFLOW HANDOFF — STAGE [12]\s*$', text, maxsplit=1)[0].rstrip()
        bodies.append(body)
    return (_MERGE_CONTRACT + '\n\n# PHASE A SOURCE RULES\n\n' + bodies[0]
            + '\n\n# PHASE B SOURCE RULES\n\n' + bodies[1]
            + '\n\n# EXECUTION REMINDER\nFollow the combined output contract above; '
            'all substantive source rules remain in force. Emit both fenced handoffs.\n')


_COMMON_FORMATTING = '''
## Formatting Rules
Import mounted `template_editing.py` with importlib; reuse its utilities rather
than regenerating DOCX code. `inspect_template(path)` lists paragraph/run
prototypes. `edit_template(source, new_output, blocks)` accepts ordered
`{source: paragraph_index, runs: [{text, source_run, bold}]}` blocks; omit runs
to retain original content/hyperlinks. Repeat an index to clone a bullet; use
the matching bold/regular prototype. It preserves paragraph properties, package
relationships and page setup. Never overwrite a source or rebuild a blank CV.
The supplied Formatting Master controls exact measurements; check it once and
retain the selected reference for visual comparison. Apply only its prescribed
properties to clones. Preserve candidate fonts, sizes, colours, indents, glyphs,
spacing, rules, alignment, bold hierarchy and tabs; no new graphics/columns/layout
tables, manual-space date alignment or blank spacing paragraphs. Verify every
same-line date/year ends at the master's defined right boundary.

## Page fit and rendering
Refine wording first: remove duplication, tighten weaker text, combine genuinely
overlapping facts, then reduce lower-ranked evidence using the selected
allocation; preserve strong evidence and meaning. For underfill restore relevant
supported content before permitted spacing changes; never use filler or disguise
weak content. Use `render_document(docx, directory)` where supported, or another
genuine DOCX renderer; visually inspect all CV/requested-letter pages. Repair
only affected paragraphs and rerender. Exactly one page each, balanced and
readable, no clipping/overlap/compression/large gaps or table/cell overflow.
Confirm page count, approximately two-line STAR bullets, font and date alignment
from the render, not settings. Flag rendering failure without claiming visual QA.
All evidence/allocation/STAR/ATS/cover-letter/final-output rules outside this
section remain fully operative.
'''.strip()


_ABHISHEK_FORMATTING = '''
### Abhishek structure and mandatory properties
Explicit user High/Lower Experience classification wins; otherwise use the
STAGE2_HANDOFF decision: High for manager/senior/step-up professional-delivery
roles; Lower for graduate/associate/early-career/transition readiness. Never
hybridise. High order: header, unlabelled profile, Experience, Education,
Additional Information. Lower: header, unlabelled profile, Education, Experience,
selected role-relevant Projects, Additional Information. Follow the master for
any permitted critical-gap project exception within High; no projects for keywords.
Calibri 10 pt body/structural text and 16 pt bold uppercase centred name;
centred regular contact, all other content justified. Profile first-line indent
0.500 in and bottom rule. Section headings bold uppercase with bottom rule:
single 0.5 pt, black/automatic, 1 pt spacing. Headers/dates/qualification lines
and Additional labels bold; profile/bullets/institution/content regular except
reference-specified descriptors. Black/automatic text; no blue/underlined links.
Letter page. High margins L/R .550 in, T/B .420 in, header/footer .200 in;
Lower L/R .500 in, top .197 in, bottom .500 in, header/footer .118 in.
High right tab 7.350 in; Lower 7.481 in, aligned consistently at the defined
boundary. Glyph •, left/hanging .118 in, single spacing. Use the master's
section-specific before/after spacing (High after-spacing; Lower before-spacing).
Start from exact master preset. Small proportionate spacing/margin adjustments
are permitted after wording, preserving each structure's visual system; never
reduce fonts, arbitrarily normalise structures, disguise weak content or stretch
the page. Check table/cell boundaries only if genuinely present in the source.
'''.strip()


_POOJA_FORMATTING = '''
### Pooja locked master properties
Use a duplicate of Pooja Tirupati K (2).docx, preserving the locked order:
PERSONAL PROFILE, EXPERIENCE, SKILLS, EDUCATION, CERTIFICATIONS,
VOLUNTEERING AND ACHIEVEMENTS. No standalone Projects section unless explicitly
authorised. Projects remain available for evidence analysis, cover letters and
interviews. Her master overrides all generic High/Lower/dynamic-spacing advice.
A4, margins top/bottom .67 cm and left/right 1.20 cm; preserve header/footer
distance 1.25 cm. Calibri 10 pt body; name 14 pt bold centred #1F3864;
contact centred black, LinkedIn 10 pt underlined #1155CC. Headings 11 pt bold
uppercase left aligned; bottom rule .75 pt #444444, 2 pt spacing. Profile and
experience/skills/education/certification bodies justified, volunteering left
aligned. Glyph ●, left/hanging .50 cm, single spacing. Preserve the master's
section-specific paragraph spacing, mixed bold/regular hierarchy and right tabs
(roles/education/certifications approximately 18.5 cm; volunteer template tab
approximately 19.5 cm). Use template properties rather than approximating them.
Margins, font sizes, colours, line/paragraph spacing, indents, rules, section
order and tab definitions are locked. Solve fit through content only; do not
change geometry/spacing to rescue overflow or underfill. Preserve the base name,
header and link styling. All final visual checks remain required.
'''.strip()


def optimize_formatting_prompt(text, candidate_key):
    start = text.find('## Formatting Rules')
    end = text.find('# Experience and Project Updating Rules', start)
    if start < 0 or end < 0:
        return text  # Unknown source layout: retain every rule untouched.
    old = text[start:end]
    allocation = ''
    a = old.find('### Experience-versus-Projects Allocation Check')
    b = old.find('### Core formatting rules', a)
    if a >= 0 and b > a:
        allocation = '\n\n' + old[a:b].rstrip()
    spec = _POOJA_FORMATTING if candidate_key == 'pooja' else _ABHISHEK_FORMATTING
    replacement = _COMMON_FORMATTING + '\n\n' + spec + allocation + '\n\n---\n\n'
    return text[:start] + replacement + text[end:]
