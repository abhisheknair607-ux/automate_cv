"""Conservative writing overlays; Drive Project Sources remain authoritative.

These rules tune natural language only, never candidate facts, factual evidence,
ATS requirements, formatting master, or the role-specific source prompts.
Candidate-specific voice can be adjusted later without changing the workflow.
"""

PROFILE_VOICE = """
PROFESSIONAL PROFILE VOICE (applies ONLY to the CV summary/profile):
- Lead with the verified professional identity and role-relevant strengths.
- Write concise, direct, natural prose; avoid exaggerated personal branding.
- Demonstrate value using verified functions, sectors, skills and achievements.
- Avoid clichés, long adjective lists, unverified experience, empty claims and
  claims of expertise unsupported by the Master CV.
- Keep the existing role-specific structure, ATS keywords and Formatting Master.
"""

COVER_LETTER_VOICE = """
COVER LETTER VOICE (supplements candidate's authoritative CL rules/template):
- Warm, personal, confident and professional, not an impersonal application form.
- Explain genuine role/company fit using specific requirements and verified work.
- Use natural transitions and a clear narrative rather than a list of CV bullets.
- Avoid 'I am excited to apply', generic flattery, keyword stuffing and
  artificially elaborate vocabulary.
- Do not introduce experience, companies, achievements, metrics, software or
  qualifications not verified by the supplied evidence.
- Respect the candidate's own voice and the requested structure/length/template.
- End with a natural, modest invitation to discuss the fit; avoid presumptuousness.
"""
