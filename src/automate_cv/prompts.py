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
            return text+contract
        if name!='#Prompt3.md': return text
        text=optimize_formatting_prompt(text,candidate_key)
        controls=(self.root/'prompts'/'03_automation_controls.md').read_text(encoding='utf-8')
        if candidate_key == 'abhishek':
            controls += '\n\n' + _ABHISHEK_AI_METRICS_CONTRACT
        marker='# Authoritative Inputs and Stage Handoff'; pos=text.find(marker)
        if pos<0 and candidate_key=='pooja':
            # Pooja's original production prompt starts at the JD section.
            pos=text.find('# Job Description')
        if pos<0: raise RuntimeError('Prompt 3 insertion marker not found.')
        return text[:pos]+controls+'\n\n'+text[pos:]
