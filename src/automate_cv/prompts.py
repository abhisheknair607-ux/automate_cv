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

## Manager-level professional-experience bullet standard
- Every work-experience bullet must start with a strong action verb appropriate
  to the candidate's demonstrated ownership, seniority and the specific JD.
  The examples below are illustrative only, not a fixed or exhaustive list:
  Led, Managed, Built, Designed, Developed, Directed, Delivered, Structured,
  Evaluated, Reviewed, Advised, Coordinated, Mentored, Optimised, Implemented,
  Spearheaded, Orchestrated, Governed, Transformed, Strengthened, Streamlined,
  Established, Oversaw, Drove, Executed, Shaped, Advanced, Integrated, Resolved,
  Negotiated, Guided, Prioritised, Improved, Standardised, Mobilised, Enabled,
  Reengineered, Consolidated, Assessed, Analysed, Facilitated and Championed.
- Select the strongest precise verb that accurately reflects the actual task and
  level of ownership. Vary openings across bullets so the CV does not read as
  repetitive or formulaic, and use additional senior action verbs beyond these
  examples whenever the verified evidence and JD make them more appropriate.
- Do not start a bullet with a passive situation statement. Express the
  situation/context after the opening action verb while retaining an integrated
  STAR structure.
- Every bullet must clearly contain Situation/Context + Task/Objective +
  Action/Method + Result/Outcome in one flowing sentence.
- End every professional-experience bullet with a supported quantitative result
  where one exists; otherwise end with a concrete qualitative delivery outcome.
- Prefer manager-level ownership language when supported, but never inflate a
  title, reporting line, decision right or team responsibility beyond evidence.
- Keep each final professional-experience bullet concise: target 25-30 words and
  never exceed 30 words unless a locked formatting/source rule explicitly
  requires otherwise.
- Avoid weak openings such as "Responsible for", "Helped", "Worked on" or
  situation-first phrasing when a stronger truthful action verb is available.

## ATS keyword coverage standard for Pooja-generated CVs
- For every Pooja CV requested from Fresh Maal, build a distinct relevant-JD
  keyword inventory before drafting and target 85-100% truthful keyword coverage.
- Prioritise exact JD wording in Profile, Experience and Skills where the
  candidate's evidence supports the exact term; use close transferable wording
  only when the exact term would overstate experience.
- Critical and strongly preferred JD keywords should appear naturally in the CV
  at least once when supported, with the strongest terms reinforced in evidence-
  bearing experience bullets rather than keyword stuffing.
- Re-check keyword coverage after drafting and use available truthful evidence to
  close remaining gaps before finalising.
- The 85% threshold is a factual-coverage target, not permission to fabricate.
  If unsupported mandatory terms prevent 85% truthful coverage, do not invent
  them: preserve factual accuracy, explicitly record the missing keywords/gaps,
  and report the achieved coverage honestly.
- Keep the CV ATS-friendly: conventional headings, plain text, no hidden keyword
  stuffing, no unsupported synonyms presented as direct experience, and no
  duplication that damages recruiter readability.
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
