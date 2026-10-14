from pathlib import Path
from .profiles import profiles
from .optimization import optimize_formatting_prompt

_STAGE2_CONTEXT_CONTRACT = '''

# Automation Context Contract — Stage 2 v2
The COMPACT SUMMARY DOC / EVIDENCE ROUTER is supplied to the model together with these instructions by the automation layer. Treat that router as available and authoritative for evidence routing. Do not state that SUMMARY DOC.docx is unavailable merely because it is not repeated inside the user message. Select evidence IDs from the supplied router and emit a complete STAGE2_HANDOFF.
'''.rstrip()

_ABHISHEK_AI_METRICS_CONTRACT = '''

# Abhishek AI, Automation and Quantified-Impact Addendum

This is an additive candidate-specific rule set for Abhishek only. It does not
replace or weaken any existing JD relevance, evidence-ranking, factual-accuracy,
seniority, STAR, ATS, one-page, formatting or source-verification rule.

## Evidence selection and positioning
- Treat applied AI, automation and financial-data capability as a permanent
  secondary differentiator in Abhishek's professional positioning when supported
  by verified evidence. Do not force AI to become the primary identity for a
  role whose JD is mainly transfer pricing, accounting, tax, corporate finance,
  commercial finance or another non-AI discipline.
- For AI/data/fintech/automation-heavy vacancies, the same verified evidence may
  receive stronger prominence. For general finance roles, keep it concise and
  practical: AI-assisted analysis, workflow automation, Python/data capability,
  financial-data science, machine learning/NLP or Copilot-style productivity
  only where the evidence source supports the claim.
- Do not automatically use the title "AI Expert". Prefer evidence-led wording
  such as applied AI, AI-enabled finance/automation, AI-assisted analysis or
  finance-and-data automation. A stronger specialist/expert label is permitted
  only when the JD and verified evidence genuinely justify it.
- During Stage 2, actively identify relevant AI/automation evidence and retain it
  in selected evidence or Stage 3 verification/retrieval when it adds material
  differentiation without displacing stronger Critical-JD evidence.

## Quantified professional-experience evidence
- When two professional-experience examples have comparable JD relevance and
  credibility, prefer the one with a verified measurable result or useful scale.
- Use this metric hierarchy: verified outcome/impact metric first; verified
  scale/volume/team/client/jurisdiction metric second; verified complexity or
  frequency indicator third; specific qualitative result only when no useful
  number is supported.
- Preserve exact source qualifiers such as "approximately", "about", ranges and
  plus signs. Never convert an approximate or ranged figure into a false exact
  number, and never invent a percentage, count, monetary value, multiple or time
  saving to complete STAR.
- Stage 2 handoffs should retain supported metrics explicitly in
  selected_professional_evidence.supported_metrics and should flag any high-value
  metric or AI/automation evidence that Stage 3 must verify before use.

## Non-quantified evidence protection
- Numbers are an enhancement, not an eligibility requirement. Never exclude,
  materially down-rank or underuse a strong fact merely because the source does
  not contain a numeric result.
- Quantification is a tie-breaker or strengthening factor only; it never
  overrides a more relevant, stronger or better-owned piece of evidence.
- Select evidence primarily on JD relevance, strength, ownership, credibility,
  seniority fit and distinctiveness. Quantification is a tie-breaker or
  strengthening factor only after those criteria; it must not become a gate.
- A directly relevant responsibility, specialist capability, complex assignment,
  stakeholder/client exposure, leadership example, regulatory/technical task or
  demonstrable achievement may be one of the strongest CV bullets even when its
  result is qualitative.
- Where a strong fact has no verified number, write the strongest specific and
  truthful qualitative result supported by the source rather than omitting the
  fact, weakening it, or substituting a less relevant quantified example.
- Do not distort evidence mix to satisfy the 60-80% quantified-bullet preference.
  If the best JD-aligned evidence produces a lower numeric share, keep the better
  evidence. Relevance and factual strength always outrank numeric density.
- Stage 2 must preserve high-value non-quantified professional evidence in the
  handoff when it is important to a Critical or Strongly Preferred requirement,
  even if supported_metrics is empty.
- Stage 3 must review both quantified and non-quantified selected evidence before
  deciding final bullets; absence of a metric is never, by itself, a reason to
  drop a selected fact from the CV.

## Final CV generation
- In Abhishek's Professional Experience, make measurable impact and scale more
  visible. Where the verified evidence genuinely supports enough figures, aim
  for roughly 60-80% of final professional-experience bullets to contain at
  least one meaningful metric. This is a preference, not a quota: never force a
  number into a bullet where it is irrelevant, weak or unsupported.
- Prefer outcome metrics (time saved, turnaround/efficiency improvement, accuracy,
  growth or delivery result) over decorative counts. Use scale metrics (clients,
  companies reviewed, engagements, jurisdictions, team size, stakeholders,
  reports, transactions or portfolios) where they materially strengthen the
  reader's understanding of scope.
- Keep metrics close to the result and, where practical, end the bullet with the
  quantified or specific impact. Preserve the existing approximately-two-line
  STAR requirement; improve wording and evidence selection before changing page
  fit.
- Do not repeat the same figure across several bullets merely to increase numeric
  density. One strong metric should usually support the strongest relevant
  achievement.
- Include at least one concise AI/automation signal somewhere in the final CV
  whenever verified evidence supports it. Placement is role-dependent: a
  professional-experience bullet for relevant applied work, profile when it
  strengthens positioning, or Skills/Additional Information when AI is secondary.
  Do not displace Critical-JD evidence just to mention AI.
- AI/automation and quantified-impact wording must remain subordinate to the
  verified Master Evidence Bank and the detailed source files. If the source does
  not support a claim or figure, omit it and use the strongest supported outcome.
'''.strip()


_POOJA_PARAPLANNING_STAR_ATS_CONTRACT = '''
# Pooja Paraplanning, Seniority, STAR and ATS Addendum

This is an additive candidate-specific rule set for Pooja only. It does not
change Abhishek's prompts, evidence, files, routing or generation behavior.
It supplements Pooja's verified/source-backed evidence and the latest facts
explicitly confirmed by the candidate.

## Newly confirmed paraplanning and financial-planning evidence
Treat the following as candidate-confirmed evidence available for Pooja's
Stage 2 evidence selection and Stage 3 CV tailoring. Use it only where relevant
to the target JD and do not broaden it beyond the stated scope.

J.P. Nugent / current Ireland financial-planning and mortgage-advisory work:
- Performs paraplanning and financial-planning work within an Irish advisory
  business, including client financial plans and cash-flow/scenario modelling.
- Uses Voyant for cash-flow modelling.
- Produces suitability reports and supports complex suitability-report work.
- Reviews adviser recommendations for technical accuracy, suitability and
  regulatory compliance and prepares client-meeting materials.
- Works across DB and DC pensions, retirement planning, investments, protection,
  estate planning, inheritance-tax planning and taxation/tax planning.
- Acts as a technical point of reference for advisers/planning stakeholders,
  liaises with financial providers, resolves technical queries and manages
  multiple financial-planning cases independently.
- Contributes to process improvement and paraplanning best practice while
  coordinating advisers, providers, product/technology stakeholders and clients.
- This is Ireland experience, not UK financial-advice-firm experience.

Bajaj Capital / Wealth Manager evidence:
- Performed paraplanning alongside wealth-management responsibilities, including
  building financial plans and cash-flow analysis for private/HNW clients.
- Produced complex suitability reports and reviewed recommendations for technical
  accuracy and regulatory compliance.
- Worked across DB and DC pensions, retirement planning, investments, protection,
  estate planning, inheritance-tax planning, tax planning/taxation and client
  meeting preparation.
- Managed multiple client cases independently and maintained suitability/client
  records and supporting documentation while coordinating advisory, operations
  and product/provider stakeholders.

## Explicit guardrails
- Do not claim Pooja has worked in a UK financial advice firm; her directly
  confirmed advisory experience is in Ireland and India.
- Do not claim FCA-authorised advice, FCA sign-off or direct FCA-regulated work
  unless a verified source explicitly supports it. Use "regulatory compliance",
  "suitability reporting" and other truthful transferable wording instead.
- Do not claim CII Level 6 Advanced Diploma, CURO or FE Analytics unless a later
  verified source confirms them.
- QFA and CFP must not be described as automatically equivalent to CII Level 6.
- Voyant may be used because the candidate explicitly confirmed hands-on use.
- Never invent experience, qualifications, software, metrics or regulatory
  authority to satisfy an ATS target.

## Locked Pooja supporting sections
These sections are identity/background records, not tailoring space. Preserve the
exact section order, entry order and factual wording below in every Pooja CV.
Do not rewrite, rename, merge, rank, remove or add entries for ATS purposes unless
the user later supplies an explicit replacement. The repository's Pooja
Formatting Master still controls font, bolding, line spacing, paragraph spacing,
right tabs, date alignment and one-page layout.

EDUCATION
- MSc Finance, University College Dublin (UCD), Ireland (2:1) — Aug 2025 to Sep 2026
- Masters in Economics, Mumbai University (3.2/4) — May 2024
- Bachelor of Commerce (Financial Markets), K.J. Somaiya College, India (GPA 3.9/4) — May 2020

CERTIFICATIONS
- Qualified Financial Adviser (QFA), Ireland and Certified Financial Planner (CFP), Global — Completed
- Chartered Financial Analyst (CFA) - Pursuing

VOLUNTEERING AND ACHIEVEMENTS
VOLUNTEER:
- Finance Director - Rotaract Club of Great Britain and Dublin. — Current to Jul 2027
- Operations and Social Media Executive - Ireland and Indian Business Association (IIBA). — Feb 2026 to Current

ACHIEVEMENTS: 2025-2026
- 1st Place - Accenture Competition (Ireland)
- 3rd Place - UNA Europa Sustainability Challenge | RSM AI Case Competition | Start-Up Competition
- Advantage Award | Global Leadership Professional Program Award | McKinsey Forward Award

Rendering rules for these locked sections:
- Keep the overall post-experience flow exactly: EDUCATION -> SKILLS ->
  CERTIFICATIONS -> VOLUNTEERING AND ACHIEVEMENTS, with VOLUNTEER and
  ACHIEVEMENTS as the existing in-section labels.
- SKILLS is the only dynamic section within this post-experience flow. Build it
  separately for every job description from the employer's critical and strongly
  preferred requirements plus verified Pooja evidence. Retain only relevant,
  truthful skills; add supported missing JD keywords where useful; remove generic
  or low-value skills when space is limited. Do not lock one universal skills
  list across applications.
- Place SKILLS immediately after EDUCATION and before CERTIFICATIONS in every
  Pooja CV. Do not move it above Education even when the JD is highly technical.
- Use the Pooja master template's existing paragraph/run prototypes and right-tab
  stops for dates/status. Do not align dates with manual spaces.
- Keep education/certification/volunteer entries on their existing line pattern
  and achievements on the same compact line pattern shown by the master.
- Do not convert these entries into bullets, narrative prose, a table, a separate
  Awards section or an Additional Information section.
- Do not move achievements into Experience, Profile or Skills and do not change
  competition placements or award names to sound more senior.
- Do not add ACCA, other qualifications, other volunteering or other awards into
  these locked sections unless the user explicitly updates this lock later.
- Before finalising any Pooja CV, compare these supporting sections line-by-line
  against this lock and correct any wording, order, date/status or grouping drift.
- ATS optimisation must be achieved primarily through Profile, Experience and
  Skills; never alter these locked supporting sections merely to increase keyword
  coverage.


## Dynamic Personal Profile standard
The PERSONAL PROFILE is always tailored for the specific job description, but
its format, length and visual footprint are deliberately stable across Pooja CVs.

- Keep PERSONAL PROFILE as one compact paragraph of exactly four sentences.
- Target 65-90 words; never exceed 100 words. Use the latest applicant-provided four-sentence, approximately 67-word finance/debt-advisory profile as the tone-and-length benchmark, tailoring supported language to each JD without changing fixed formatting.
- Preserve the master CV heading, font, paragraph style, spacing and one-page
  layout. Do not turn the profile into bullets, a multi-paragraph summary or an
  objective statement.
- Write with the concise, selective tone expected in top-tier finance,
  consulting and professional-services applications. Sound commercially strong
  and evidence-led, not aspirational or promotional. Never use first person or
  phrases such as "seeking", "looking for", "excited to", "passionate about" or
  "results-driven".
- Do not make Pooja permanently sound like only a wealth-planning candidate.
  Reposition her professional identity for each vacancy using the JD's most
  important supported themes while retaining truthful continuity across finance,
  strategy, private wealth, financial planning, investments, WealthTech,
  commercial execution, analytics and client/stakeholder leadership.
- Use exact JD terminology naturally when verified evidence supports it. Select
  only the highest-value keywords for the profile; place the rest in Experience
  or Skills. Never turn the profile into a keyword list.
- Sentence 1: state professional identity, 5+ years of experience and the
  2-4 most relevant domains/capabilities for this JD.
- Sentence 2: lead with the strongest verified scale, achievement or commercial
  result relevant to the vacancy, then connect it to the employer's priority
  capabilities. Use €80.5M only when it materially strengthens role fit; choose a
  different verified proof point when another achievement is more relevant.
- Sentence 3: highlight the most relevant current or recent work, decision-making,
  analytical/problem-solving, product, client or cross-functional capability for
  the JD. AI-enabled/WealthTech wording is optional and should appear only when
  it improves fit.
- Sentence 4: close with the most relevant verified qualifications plus 2-3
  high-value capabilities from the JD. Qualifications must remain factually
  accurate and must not crowd out stronger job-specific positioning.
- For strategy/consulting roles, prioritise structured problem-solving,
  commercial analysis, strategic execution, stakeholder management and
  cross-functional delivery when supported. For investment/markets/finance roles,
  prioritise financial analysis, investments, risk, portfolio/commercial
  decision-making and measurable impact. For wealth/planning roles, prioritise
  HNW/private-client work, holistic financial planning, pensions/investments,
  suitability, cash-flow modelling and relationship management. Apply the same
  principle to any other role family using that JD's own critical requirements.
- Never invent a new capability simply to make the opening sound suitable for a
  prestigious employer. The profile must be fully traceable to verified Pooja
  evidence or candidate-confirmed facts available to the workflow.
- After drafting, compare the profile against the JD and the rest of the CV:
  remove duplicated wording, ensure the opening is differentiated, confirm the
  strongest supported keywords are present, and keep the final result within the
  four-sentence / 65-90-word target (maximum 100 words).

Latest approved applicant-supplied profile benchmark (14 Oct 2026) is preserved verbatim in Pooja's private Summary Doc and detailed Master CV. It is four sentences and approximately 67 words. Follow its structure: (1) professional identity and 5+ years; (2) quantified portfolio/impact and analytical actions; (3) client work alongside company valuation, LBO financing, debt-capacity and financial modelling from academic/independent projects, explicitly labelled as such; (4) MSc Finance, UCD Smurfit, QFA/CFP and truthful CFA status. Reprioritise for each JD; do not fabricate professional transaction ownership, metrics or qualifications.

## Manager-level professional-experience bullet standard
- Every work-experience bullet must start with a clear, natural action verb that
  reflects the candidate's actual ownership and seniority. Prefer normal human
  CV language such as Led, Managed, Built, Designed, Developed, Delivered,
  Reviewed, Advised, Mentored, Implemented, Coordinated, Analysed, Evaluated,
  Improved, Resolved, Prepared, Produced, Oversaw, Strengthened or Streamlined.
- Do not use inflated, theatrical or obviously AI-style verbs such as
  "Orchestrated", "Spearheaded", "Championed" or similarly artificial wording
  merely to make a bullet sound senior. Seniority must come from the scope,
  decision-making, stakeholders, complexity and result, not from exaggerated
  vocabulary.
- Select the simplest strong verb that accurately describes the work. Vary
  openings naturally, but never force unusual synonyms just to avoid repetition.
  A familiar verb may be reused when it is genuinely the clearest description.
- Write in concise, professional, human-sounding English. Avoid generic AI
  phrasing, buzzword chains, over-polished corporate language, unnecessary
  adjectives, repeated sentence templates and keyword lists disguised as prose.
- Do not start a bullet with a passive situation statement. Put the action first,
  then incorporate Situation/Context + Task/Objective + Action/Method +
  Result/Outcome naturally within one flowing sentence.
- Every bullet must clearly communicate STAR substance without labelling the
  components or making the sentence sound formulaic.
- End every professional-experience bullet with a supported quantitative result
  where one exists; otherwise end with a specific, credible qualitative outcome.
- Prefer manager-level ownership language when supported, but never inflate a
  title, reporting line, decision right, team responsibility or strategic scope.
- Keep final professional-experience bullets within 25 words and approximately two lines, each containing Situation, Task, Action and Result. Longer original source examples must be preserved verbatim in the evidence bank and selectively condensed for CVs without losing STAR meaning or supported metrics.
- Avoid weak openings such as "Responsible for", "Helped" or "Worked on" when a
  more direct and truthful action verb is available.

## Mandatory Pooja STAR bullet and quantified-result standard (14 Oct 2026)
- For each final Pooja professional-experience bullet, express all four STAR
  elements within one natural sentence: Situation/client or business context,
  Task/ownership, Action/method, and Result/impact. Begin with a truthful,
  direct action verb; do not use visible S/T/A/R labels.
- Respect the candidate's specific CV-writing limit: no more than 25 words
  per experience bullet and approximately two rendered lines. Preserve all
  four STAR elements when tightening text; never shorten a bullet into an
  action-only task description to satisfy the one-page layout.
- Where a relevant, candidate-confirmed result exists in Pooja's current
  Summary Doc, Master Evidence Bank or latest detailed Master Base CV, end
  the bullet with that measured result, with its exact unit and qualifiers.
  Prefer genuinely quantified efficiency, planning, implementation-cost and
  turnaround results over invented or generic business impact.
- Review Pooja's latest candidate-supplied J.P. Nugent / LifeGoals & MortgageStop source evidence: five MVP workstreams and 60-day roadmap with reported 15% delivery-efficiency improvement; eight-domain planning platform design with reported 20% planning-efficiency improvement; vendor/commercial assessment with reported 25% implementation-cost reduction; and adviser/client cross-functional delivery with reported 30% turnaround improvement. Preserve exact source wording in private evidence files. Select by JD relevance; do not force all four on each CV.
- Prefer latest applicant-supplied role-title style: Proposition Manager / Project Lead - J.P. Nugent (Jul 2026 to Current). Check the MortgageStop.ai vs MortgageStop.com product-name variation before using a suffix.
- When multiple versions describe different MVP roadmap durations or
  implementation phases, preserve both original statements and do not
  silently replace, reconcile or combine timelines. Confirm which scope and
  period a reported outcome covers before asserting a single timeline.
- Candidate-supplied numerical outcomes are source claims, not independently
  audited results. Do not fabricate baselines, causal mechanisms, client
  counts or regulatory authority, and flag material unresolved conflicts.
- Before exporting, explicitly check every Pooja experience bullet for
  S + T + A + R, word count <=25, source-backed result, accuracy, ATS
  relevance, visual two-line fit and consistent formatting. Fix failures
  before calling a CV final; if genuine constraints cannot be reconciled,
  report the unresolved issue rather than quietly dropping STAR content.

## ATS, recruiter-fit and gap-closure standard for Pooja-generated CVs
- For every Pooja CV requested from Fresh Maal, build a distinct JD keyword and
  requirement inventory before drafting and target 85-100% truthful keyword
  coverage.
- Classify requirements into critical/mandatory, strongly preferred and
  secondary. Map each requirement to verified Pooja evidence before deciding
  where it belongs in Profile, Experience, Skills, Education or Certifications.
- Prioritise exact JD wording where the evidence supports the exact term. Use
  close transferable wording only when the exact phrase would overstate the
  candidate's experience.
- After the first draft, run a second gap pass. For every uncovered or weak JD
  requirement, check all available Pooja evidence again and close the gap when
  it is genuinely within the candidate's experience by adding or repositioning
  concise keywords, evidence or skills.
- Do not leave a controllable keyword gap merely because the first draft omitted
  it. If a supported keyword can be added naturally without weakening readability
  or factual accuracy, add it before finalising.
- Critical and strongly preferred keywords should appear naturally at least once
  when supported, with the most important terms evidenced in work-experience
  bullets rather than only placed in Skills.
- Do not keyword-stuff. Remove duplicated, awkward or low-value wording when the
  same ATS coverage can be achieved more naturally elsewhere in the CV.
- The 85% threshold is a factual-coverage target, not permission to fabricate.
  If unsupported mandatory terms prevent 85% truthful coverage, preserve factual
  accuracy, explicitly record the unresolved gaps and report the achieved
  coverage honestly rather than inventing experience.
- Before finalising, perform a recruiter-fit review as well as the ATS check:
  confirm the opening profile matches the target role and seniority; the first
  bullets show the strongest relevant evidence; managerial ownership is visible;
  achievements/results are credible; terminology is natural; chronology and
  titles remain accurate; and the CV reads like a strong human-written
  application rather than an ATS keyword document.
- Check for repetitive verbs, repeated metrics, duplicated responsibilities,
  weak filler bullets, unsupported claims, awkward grammar, excessive jargon and
  unnatural phrasing. Rewrite any such issue before finalisation.
- Preserve all existing factual QA, source-verification, one-page/rendering,
  formatting, evidence-selection and candidate-isolation checks. ATS optimisation
  and recruiter fit must never override factual support or verified source
  boundaries.
- Final objective: maximise truthful ATS coverage and recruiter relevance
  simultaneously. A Pooja CV should not be marked final until all controllable
  JD gaps have been addressed and the remaining gaps are genuinely unsupported
  or outside the candidate's experience.
'''.strip()


class Prompts:
    def __init__(self,drive,settings,root): self.drive=drive; self.settings=settings; self.root=Path(root); self.cache={}; self.profiles=profiles()
    def _id(self,candidate_key,name):
        p=self.profiles[candidate_key]
        return {'#Prompt1.md':p.prompt1_file_id,'#Prompt2.md':p.prompt2_file_id,'#Prompt3.md':p.prompt3_file_id}[name]
    def read(self,candidate_key,name,workdir):
        key=(candidate_key,name)
        if key not in self.cache:
            file_id=self._id(candidate_key,name)
            if not file_id: raise RuntimeError(f'{candidate_key}: {name} Drive file ID is not configured.')
            path=self.drive.download(file_id,Path(workdir)/f'authoritative_{candidate_key}_{name.replace("#","")}')
            self.cache[key]=path.read_text(encoding='utf-8')
        text=self.cache[key]
        if name=='#Prompt2.md':
            contract = _STAGE2_CONTEXT_CONTRACT
            if candidate_key == 'abhishek':
                contract += '\n' + _ABHISHEK_AI_METRICS_CONTRACT + '\n'
            if candidate_key == 'pooja':
                contract += '\nFor Pooja, use the exact PR-POOJA-* and FIN-POOJA-* evidence keys in the Summary Doc automation index. Read the October 2026 additions and current-fact precedence rules before using historical evidence. Do not emit Abhishek PR-EY, PR-TAXLINK or P01-P26 identifiers. Retain project classifications and contribution restrictions. The Summary Doc is preserved in full; its historical facts may be superseded by the additive update.\n'
                contract += '\n\n' + _POOJA_PARAPLANNING_STAR_ATS_CONTRACT + '\n'
            return text+contract
        if name!='#Prompt3.md': return text
        text=optimize_formatting_prompt(text,candidate_key)
        controls=(self.root/'prompts'/'03_automation_controls.md').read_text(encoding='utf-8')
        if candidate_key == 'abhishek':
            controls += '\n\n' + _ABHISHEK_AI_METRICS_CONTRACT
        if candidate_key == 'pooja':
            controls += '\n\n' + _POOJA_PARAPLANNING_STAR_ATS_CONTRACT
        marker='# Authoritative Inputs and Stage Handoff'; pos=text.find(marker)
        if pos<0 and candidate_key=='pooja':
            # Pooja's original production prompt starts at the JD section.
            pos=text.find('# Job Description')
        if pos<0: raise RuntimeError('Prompt 3 insertion marker not found.')
        return text[:pos]+controls+'\n\n'+text[pos:]
