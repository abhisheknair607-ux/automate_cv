import hashlib, json, re, time
from pathlib import Path
import httpx
from .context import write_context
from .qa import normalize, one_page, QAError, factual_report
from .sources import Sources, docx_text


def _usage(r):
    u=getattr(r,'usage',None)
    if not u: return {'input':0,'cached':0,'uncached':0,'output':0,'reasoning':0,'cost':0.0}
    inp=getattr(u,'input_tokens',0) or 0; out=getattr(u,'output_tokens',0) or 0
    ind=getattr(u,'input_tokens_details',None); oud=getattr(u,'output_tokens_details',None)
    cached=(getattr(ind,'cached_tokens',0) or 0) if ind else 0; reasoning=(getattr(oud,'reasoning_tokens',0) or 0) if oud else 0
    cost=(max(inp-cached,0)*4.0+cached*0.4+out*20.0)/1_000_000
    return {'input':inp,'cached':cached,'uncached':max(inp-cached,0),'output':out,'reasoning':reasoning,'cost':cost}

def _hash(text): return hashlib.sha256(text.encode('utf-8')).hexdigest()
def _safe(text): return re.sub(r'[\\/:*?"<>|]+','-',text).strip().strip('.')[:120] or 'Unknown'

def _transient(e):
    status=getattr(e,'status_code',None)
    if status in {408,409,429} or (isinstance(status,int) and status>=500): return True
    return isinstance(e,(TimeoutError,ConnectionError,httpx.TimeoutException,httpx.NetworkError))

class Workflow:
    def __init__(self,settings,freshmal,drive,ai,prompts):
        self.s=settings; self.sheet=freshmal; self.drive=drive; self.ai=ai; self.prompts=prompts; self.sources=Sources(drive,settings)

    def retry(self,fn,label='operation'):
        for attempt in range(self.s.max_retries+1):
            try: return fn()
            except Exception as e:
                print(f'[workflow] {label} attempt {attempt+1}/{self.s.max_retries+1} failed: {type(e).__name__}: {e}',flush=True)
                if attempt>=self.s.max_retries or not _transient(e): raise
                time.sleep(min(2**(attempt+1),10))

    def _folders(self,a):
        candidate,_=self.drive.folder(a.folder_name,self.s.drive_output_folder_id)
        company,_=self.drive.folder(_safe(a.company),candidate)
        role_name=_safe(f'{a.designation}, {a.location}' if a.location else a.designation)
        role,link=self.drive.folder(role_name,company)
        return role,link

    def _manifest(self,folder,work):
        path=work/'run_manifest.json'; self.drive.download_if_exists('run_manifest.json',folder,path)
        if not path.exists(): return {},path
        try: return json.loads(path.read_text(encoding='utf-8')),path
        except Exception: return {},path

    def _save_manifest(self,manifest,path,folder):
        path.write_text(json.dumps(manifest,indent=2,sort_keys=True),encoding='utf-8'); self.drive.upload(path,folder)

    def _guard(self,usage):
        total=sum(x['cost'] for x in usage.values())
        if total>self.s.cost_hard_stop_usd: raise RuntimeError(f'Estimated token cost ${total:.2f} exceeds hard stop ${self.s.cost_hard_stop_usd:.2f}.')
        return total

    def run(self,a):
        print(f'[workflow] Starting {a.candidate_key} application: {a.company} - {a.designation}',flush=True)
        if not self.sheet.prepare(a): return
        errors=a.validate()
        if errors:
            message=' '.join(errors); self.sheet.fail(a,message,'ERROR_CONFIG'); raise RuntimeError(message)
        self.sheet.claim(a); work=Path(self.s.workdir)/a.application_id; work.mkdir(parents=True,exist_ok=True)
        usage={}; current_stage='INITIALISING'; folder=None
        try:
            folder,_=self._folders(a)
            p1=self.prompts.read(a.candidate_key,'#Prompt1.md',work); p2=self.prompts.read(a.candidate_key,'#Prompt2.md',work); p3=self.prompts.read(a.candidate_key,'#Prompt3.md',work)
            keys={'candidate':a.candidate_key,'jd_hash':a.jd_hash,'prompt1_hash':_hash(p1),'prompt2_hash':_hash(p2),'prompt3_hash':_hash(p3)}
            manifest,manifest_path=self._manifest(folder,work)
            compatible=all(manifest.get(k)==v for k,v in keys.items())
            if not compatible: manifest=dict(keys)

            current_stage='STAGE_1'; self.sheet.update(a,{'workflow':current_stage})
            stage1_path=work/'stage1.md'; s1=''
            if compatible and manifest.get('stage1_complete') and self.drive.download_if_exists('stage1.md',folder,stage1_path):
                s1=stage1_path.read_text(encoding='utf-8'); print('[workflow] Reusing Stage 1 checkpoint',flush=True)
            else:
                input1=f'Company: {a.company}\nDesignation: {a.designation}\nLink: {a.application_link}\n\nRAW JOB DESCRIPTION\n{a.raw_jd}'
                s1,r1=self.retry(lambda:self.ai.text(p1,input1,self.s.stage1_reasoning_effort,self.s.stage1_max_output_tokens),'Stage 1 AI call')
                usage['stage1']=_usage(r1); self._guard(usage); stage1_path.write_text(s1,encoding='utf-8'); self.drive.upload(stage1_path,folder)
                manifest.update(keys); manifest['stage1_complete']=True; self._save_manifest(manifest,manifest_path,folder)

            current_stage='STAGE_2'; self.sheet.update(a,{'workflow':current_stage})
            stage2_path=work/'stage2.md'; s2=''; summary,summary_path=self.sources.stage2(a.candidate_key,work)
            if compatible and manifest.get('stage2_complete') and self.drive.download_if_exists('stage2.md',folder,stage2_path):
                s2=stage2_path.read_text(encoding='utf-8'); print('[workflow] Reusing Stage 2 checkpoint',flush=True)
            else:
                # Stable candidate evidence is deliberately placed before job-specific dynamic material for cache-friendly prefixes.
                input2=f'COMPLETE SUMMARY DOC\n{summary}\n\nRAW JOB DESCRIPTION\n{a.raw_jd}\n\nCOMPLETE STAGE 1 OUTPUT\n{s1}'
                s2,r2=self.retry(lambda:self.ai.text(p2,input2,self.s.stage2_reasoning_effort,self.s.stage2_max_output_tokens),'Stage 2 AI call')
                usage['stage2']=_usage(r2); self._guard(usage); stage2_path.write_text(s2,encoding='utf-8'); self.drive.upload(stage2_path,folder)
                manifest.update(keys); manifest['stage2_complete']=True; self._save_manifest(manifest,manifest_path,folder)

            current_stage='STAGE_3'; self.sheet.update(a,{'workflow':current_stage})
            source_paths=self.sources.stage3(a.candidate_key,work,summary_path,s2)
            controls=f'MAKE_CV = TRUE\nMAKE_COVER_LETTER = {str(a.make_cl).upper()}\nWEB_SEARCH = {str(a.web_search).upper()}'
            input3=(f'{controls}\n\nCompany: {a.company}\nRole: {a.designation}\nLink: {a.application_link}'
                    f'\n\nRAW JOB DESCRIPTION\n{a.raw_jd}\n\nCOMPLETE STAGE 1 OUTPUT\n{s1}\n\nCOMPLETE STAGE 2 OUTPUT\n{s2}'
                    '\n\nUse supplied source files with the Python tool and create the required Word artifact(s).')
            s3,r3,artifacts=self.retry(lambda:self.ai.stage3(p3,input3,source_paths,work/'generated',a.web_search,self.s.stage3_reasoning_effort,self.s.stage3_max_output_tokens),'Stage 3 AI/artifact call')
            usage['stage3']=_usage(r3); cost=self._guard(usage); (work/'stage3.md').write_text(s3,encoding='utf-8')

            current_stage='NORMALIZE'; final=work/'final'; company=_safe(a.company); role=_safe(a.designation)
            cv,cl=normalize(artifacts,f'{a.filename_name}_{company}_{role}_CV.docx',f'{a.filename_name}_{company}_{role}_Cover_Letter.docx' if a.make_cl else None,final)

            current_stage='QA'; self.sheet.update(a,{'workflow':current_stage}); one_page(cv,work/'rendered');
            if cl: one_page(cl,work/'rendered')
            source_text=summary
            for p in source_paths:
                try:
                    if str(p).lower().endswith('.docx') and Path(p)!=summary_path: source_text+='\n'+docx_text(p)
                except Exception: pass
            report=factual_report(cv,source_text,work/'Factual_QA.md')
            if report['critical']:
                raise QAError('Factual QA found unsupported high-risk claims: '+'; '.join(report['critical'][:8]))

            current_stage='DRIVE_UPLOAD'; _,cv_link=self.drive.upload(cv,folder); cl_link=''
            if cl: _,cl_link=self.drive.upload(cl,folder)
            for audit in ['stage1.md','stage2.md','stage3.md','Factual_QA.md']:
                p=work/audit
                if p.exists(): self.drive.upload(p,folder)
            usage_path=work/'Token_Usage.json'; usage_path.write_text(json.dumps({'candidate':a.candidate_key,'application_id':a.application_id,'stages':usage,'this_run_cost':cost},indent=2),encoding='utf-8'); self.drive.upload(usage_path,folder)
            context=write_context(work/'Application_Context.md',a,s1,s2,s3,cv,cv_link); _,context_link=self.drive.upload(context,folder)
            manifest.update(keys); manifest.update({'stage1_complete':True,'stage2_complete':True,'stage3_complete':True,'complete':True}); self._save_manifest(manifest,manifest_path,folder)
            self.sheet.done(a,cv_link,cl_link,context_link,cost); print(f'[workflow] COMPLETE: {a.application_id}; cost=${cost:.4f}',flush=True)
        except QAError as e:
            self.sheet.fail(a,f'{current_stage}: {e}','ERROR_MANUAL'); raise
        except Exception as e:
            self.sheet.fail(a,f'{current_stage}: {type(e).__name__}: {e}'); raise
