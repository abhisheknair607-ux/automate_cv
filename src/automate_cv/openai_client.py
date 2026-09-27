import json
from pathlib import Path
import httpx
from openai import OpenAI

class AI:
    def __init__(self,settings):
        if not settings.openai_api_key: raise RuntimeError('OPENAI_API_KEY is not configured.')
        self.client=OpenAI(api_key=settings.openai_api_key); self.settings=settings
        self.http=httpx.Client(base_url='https://api.openai.com/v1',headers={'Authorization':f'Bearer {settings.openai_api_key}'},timeout=180)
    def text(self,prompt,user_input,reasoning_effort=None,max_output_tokens=None):
        kwargs={'model':self.settings.openai_model,'instructions':prompt,'input':user_input,'reasoning':{'effort':reasoning_effort or self.settings.openai_reasoning_effort}}
        if max_output_tokens: kwargs['max_output_tokens']=max_output_tokens
        r=self.client.responses.create(**kwargs)
        return r.output_text,r
    def upload(self,path):
        with Path(path).open('rb') as fh: return self.client.files.create(file=fh,purpose='user_data').id
    def _dict(self,obj):
        return obj.model_dump() if hasattr(obj,'model_dump') else json.loads(obj.json())
    def _generated_files(self,response):
        found=[]
        def walk(x):
            if isinstance(x,dict):
                if x.get('type')=='container_file_citation' and x.get('container_id') and x.get('file_id'):
                    found.append((x['container_id'],x['file_id'],x.get('filename') or f"{x['file_id']}.bin"))
                for v in x.values(): walk(v)
            elif isinstance(x,list):
                for v in x: walk(v)
        walk(self._dict(response)); return list(dict.fromkeys(found))
    def stage3(self,prompt,user_input,paths,output_dir,web_search=False,reasoning_effort=None,max_output_tokens=None):
        ids=[self.upload(p) for p in paths]
        tools=[{'type':'code_interpreter','container':{'type':'auto','file_ids':ids}}]
        if web_search: tools.append({'type':'web_search'})
        try:
            kwargs={'model':self.settings.openai_model,'instructions':prompt,'input':user_input,'reasoning':{'effort':reasoning_effort or self.settings.openai_reasoning_effort},'tools':tools}
            if max_output_tokens: kwargs['max_output_tokens']=max_output_tokens
            r=self.client.responses.create(**kwargs)
            output_dir=Path(output_dir); output_dir.mkdir(parents=True,exist_ok=True); artifacts=[]
            for container_id,file_id,filename in self._generated_files(r):
                res=self.http.get(f'/containers/{container_id}/files/{file_id}/content'); res.raise_for_status()
                target=output_dir/Path(filename).name; target.write_bytes(res.content); artifacts.append(target)
            return r.output_text,r,artifacts
        finally:
            for file_id in ids:
                try: self.client.files.delete(file_id)
                except Exception: pass
