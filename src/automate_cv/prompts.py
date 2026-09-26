from pathlib import Path

class Prompts:
    def __init__(self,drive,settings,root): self.drive=drive; self.settings=settings; self.root=Path(root); self.cache={}
    def _id(self,name): return {'#Prompt1.md':self.settings.prompt1_file_id,'#Prompt2.md':self.settings.prompt2_file_id,'#Prompt3.md':self.settings.prompt3_file_id}[name]
    def read(self,name,workdir):
        if name not in self.cache:
            if not self._id(name): raise RuntimeError(f'{name} Drive file ID is not configured.')
            path=self.drive.download(self._id(name),Path(workdir)/f'authoritative_{name.replace("#","")}')
            self.cache[name]=path.read_text(encoding='utf-8')
        text=self.cache[name]
        if name!='#Prompt3.md': return text
        controls=(self.root/'prompts'/'03_automation_controls.md').read_text(encoding='utf-8')
        marker='# Authoritative Inputs and Stage Handoff'; pos=text.find(marker)
        if pos<0: raise RuntimeError('Prompt 3 insertion marker not found.')
        return text[:pos]+controls+'\n\n'+text[pos:]
