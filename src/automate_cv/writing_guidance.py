"""Candidate-specific style overlays for the independently generated CV and CL.

The candidate's Drive prompts, evidence, CV master and CL rules/template remain
authoritative. These overlays control voice and optional CL presentation only.
"""

_PROFILE_COMMON = """
PROFESSIONAL PROFILE VOICE (CV profile only):
- Open with the candidate's verified professional identity and the strongest
  role-relevant capability. Keep the existing profile length, structure, ATS
  terms and candidate Formatting Master.
- Sound warm, engaged and human through precise, natural wording and a clear
  reason this work appeals to the candidate. Convey interest in contributing to
  this employer without claiming a personal connection or inside knowledge.
- Ground every strength and example in this candidate's selected, verified
  evidence. Prefer concrete work and outcomes to adjectives, slogans or a list
  of keywords. Do not turn the CV profile into a miniature cover letter.
- Preserve factual boundaries: no invented experience, responsibilities,
  employers, qualifications, achievements, metrics, tools or biography.
""".strip()

_COVER_LETTER_COMMON = """
COVER LETTER VOICE AND STORY (supplements authoritative candidate CL rules):
- Write a warm, genuinely interested, professional letter in the candidate's
  own voice. State why this specific role and company appeal, connecting the
  actual job requirements to one or two verified examples of the candidate's
  work and its supported result. Avoid generic praise and a CV-bullet recap.
- Give the letter a coherent personal thread: a verified formative experience
  or motivation, how it shaped the candidate's work, and why joining this team
  is a meaningful next step. Use Mumbai origins or a humble-background story
  ONLY if independently verified in this candidate's own source material.
  Mumbai appearing in an education or employer location is not evidence of
  birthplace, upbringing or socioeconomic background. Never transfer one
  candidate's biography to the other or embellish hardship or emotion.
- If no personal origin story is verified, build the narrative from verified
  career choices, professional work or stated motivation. If motivation is not
  evidenced, express specific interest in the documented role and company
  work without inventing a life story or personal attachment.
- Let enthusiasm show through specific, measured language and a forward-looking
  close. Avoid formulaic openings, exaggerated excitement, flattery, unsupported
  company claims and promises about impact that the evidence cannot support.
- Respect the candidate's authoritative CL template, requested length and
  factual rules. Use only selected evidence or explicitly verified additions;
  check all names, dates, metrics, qualifications and examples against sources.

COVER LETTER DOCX PRESENTATION:
- Produce one polished, professional, one-page DOCX. Use a single-column reading
  order with selectable text, ordinary paragraphs and familiar type. Keep the
  name, contact details, date, recipient/company, salutation, body and sign-off
  easy to scan. Follow the candidate's CL template when one is supplied.
- Use restrained accent colour on at most the name or one small heading and a
  thin divider or short rule. Keep body text dark with strong contrast, modest
  margins and comfortable spacing. Do not add logos, icons, large colour blocks,
  text boxes, multi-column layouts or layout tables that impair ATS reading.
- Borrow an accent only from a verified official company website, brand asset or
  supplied template, and only when WEB_SEARCH permits research or the asset is
  already provided. Do not guess a brand colour from the company name, JD or
  memory. If no reliable brand colour is available, use a restrained neutral
  accent. The candidate's CL template takes precedence over this optional cue.
- Render the finished DOCX, inspect the full page visually for hierarchy,
  contrast, spacing, clipping and overflow, and repair any defect. Confirm the
  text remains selectable and the one-page letter reads in a sensible order.
""".strip()

_CANDIDATE_GUIDANCE = {
    'abhishek': {
        'profile': (
            'For Abhishek, lead with the verified finance or commercial identity '
            'that best fits this JD. Mention applied AI, automation or data work '
            'only where his own evidence supports it and it adds relevant value; '
            'do not recast a finance role as an AI specialist role.'
        ),
        'letter': (
            'For Abhishek, choose a supported finance, analytical or applied '
            'automation example that answers a real requirement of this role. '
            'Use his own verified motivations and history for any personal story; '
            'do not infer his upbringing from Mumbai-related records.'
        ),
    },
    'pooja': {
        'profile': (
            'For Pooja, lead with the verified financial-planning, advisory or '
            'other role-relevant identity supported by her evidence. Show care '
            'for clients and sound technical judgement through specific work '
            'where relevant, without implying UK or FCA experience she lacks.'
        ),
        'letter': (
            'For Pooja, choose a supported client-planning, suitability or '
            'other role-relevant example. Keep her Ireland and India experience '
            'distinct and use only her own verified personal history; a Mumbai '
            'education record does not establish her origins or background.'
        ),
    },
}


def profile_voice(candidate_key: str) -> str:
    """Return CV-profile guidance without cross-candidate personal claims."""
    return _PROFILE_COMMON + '\n- ' + _CANDIDATE_GUIDANCE[candidate_key]['profile']


def cover_letter_voice(candidate_key: str) -> str:
    """Return independent CL voice and document-layout guidance."""
    return _COVER_LETTER_COMMON + '\n- ' + _CANDIDATE_GUIDANCE[candidate_key]['letter']
