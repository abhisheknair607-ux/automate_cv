from pathlib import Path
from openai import OpenAI

class AI:
    def __init__(self,settings):
        if not settings.openai_api_key: raise RuntimeError('OPENAI_API_KEY is not configured.')
        self.client=OpenAI(api_key=settings.openai_api_key); self.settings=settings
    def text(self,prompt,user_input):
        r=self.client.responses.create(model=self.settings.openai_model,instructions=prompt,input=user_input,reasoning={'effort':self.settings.openai_reasoning_effort})
        return r.output_text,r
    def upload(self,path):
        with Path(path).open('rb') as fh: return self.client.files.create(file=fh,purpose='user_data').id
    def stage3(self,prompt,user_input,paths,web_search=False):
        ids=[self.upload(p) for p in paths]
        tools=[{'type':'code_interpreter','container':{'type':'auto','file_ids':ids}}]
        if web_search: tools.append({'type':'web_search'})
        try:
            r=self.client.responses.create(model=self.settings.openai_model,instructions=prompt,input=user_input,reasoning={'effort':self.settings.openai_reasoning_effort},tools=tools)
            return r.output_text,r
        finally:
            for file_id in ids:
                try: self.client.files.delete(file_id)
                except Exception: pass
