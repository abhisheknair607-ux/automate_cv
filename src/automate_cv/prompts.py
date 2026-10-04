from pathlib import Path
from .profiles import profiles
from .optimization import optimize_formatting_prompt

_STAGE2_CONTEXT_CONTRACT = '''

# Automation Context Contract — Stage 2 v2
The COMPACT SUMMARY DOC / EVIDENCE ROUTER is supplied to the model together with these instructions by the automation layer. Treat that router as available and authoritative for evidence routing. Do not state that SUMMARY DOC.docx is unavailable merely because it is not repeated inside the user message. Select evidence IDs from the supplied router and emit a complete STAGE2_HANDOFF.
'''.rstrip()


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
            if candidate_key == 'pooja':
                contract += '\nFor Pooja, use the exact PR-POOJA-* and FIN-POOJA-* evidence keys in the Summary Doc automation index. Read the October 2026 additions and current-fact precedence rules before using historical evidence. Do not emit Abhishek PR-EY, PR-TAXLINK or P01-P26 identifiers. Retain project classifications and contribution restrictions. The Summary Doc is preserved in full; its historical facts may be superseded by the additive update.\n'
            return text+contract
        if name!='#Prompt3.md': return text
        text=optimize_formatting_prompt(text,candidate_key)
        controls=(self.root/'prompts'/'03_automation_controls.md').read_text(encoding='utf-8')
        marker='# Authoritative Inputs and Stage Handoff'; pos=text.find(marker)
        if pos<0 and candidate_key=='pooja':
            # Pooja's original production prompt starts at the JD section.
            pos=text.find('# Job Description')
        if pos<0: raise RuntimeError('Prompt 3 insertion marker not found.')
        return text[:pos]+controls+'\n\n'+text[pos:]
