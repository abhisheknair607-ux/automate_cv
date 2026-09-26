import time
from pathlib import Path
from .context import write_context
from .qa import normalize, one_page, QAError
from .sources import Sources

def usage_cost(responses):
    total=0.0
    for r in responses:
        u=getattr(r,'usage',None)
        if not u: continue
        inp=getattr(u,'input_tokens',0) or 0; out=getattr(u,'output_tokens',0) or 0
        details=getattr(u,'input_tokens_details',None); cached=getattr(details,'cached_tokens',0) if details else 0
        total+=(max(inp-cached,0)*4.0+cached*0.4+out*20.0)/1_000_000
    return total

class Workflow:
    def __init__(self,settings,freshmal,drive,ai,prompts):
        self.s=settings; self.sheet=freshmal; self.drive=drive; self.ai=ai; self.prompts=prompts; self.sources=Sources(drive,settings)
    def retry(self,fn):
        for attempt in range(self.s.max_retries+1):
            try: return fn()
            except Exception:
                if attempt>=self.s.max_retries: raise
                time.sleep(min(2**(attempt+1),10))
    def run(self,a):
        if not self.sheet.prepare(a): return
        errors=a.validate()
        if errors: self.sheet.fail(a,' '.join(errors),'ERROR_CONFIG'); return
        self.sheet.claim(a); work=Path(self.s.workdir)/a.application_id; work.mkdir(parents=True,exist_ok=True); responses=[]
        try:
            self.sheet.update(a.row_number,{'workflow':'STAGE_1'})
            input1=f'Company: {a.company}\nDesignation: {a.designation}\nLink: {a.application_link}\n\nRAW JOB DESCRIPTION\n{a.raw_jd}'
            s1,r1=self.retry(lambda:self.ai.text(self.prompts.read('#Prompt1.md',work),input1)); responses.append(r1); (work/'stage1.md').write_text(s1,encoding='utf-8')
            self.sheet.update(a.row_number,{'workflow':'STAGE_2'})
            summary,summary_path=self.sources.stage2(work); input2=f'RAW JOB DESCRIPTION\n{a.raw_jd}\n\nCOMPLETE STAGE 1 OUTPUT\n{s1}\n\nCOMPLETE SUMMARY DOC\n{summary}'
            s2,r2=self.retry(lambda:self.ai.text(self.prompts.read('#Prompt2.md',work),input2)); responses.append(r2); (work/'stage2.md').write_text(s2,encoding='utf-8')
            self.sheet.update(a.row_number,{'workflow':'STAGE_3'}); source_paths=self.sources.stage3(work,summary_path,s2)
            controls=f'MAKE_CV = TRUE\nMAKE_COVER_LETTER = {str(a.make_cl).upper()}\nWEB_SEARCH = {str(a.web_search).upper()}'
            input3=f'{controls}\n\nCompany: {a.company}\nRole: {a.designation}\nLink: {a.application_link}\n\nRAW JOB DESCRIPTION\n{a.raw_jd}\n\nCOMPLETE STAGE 1 OUTPUT\n{s1}\n\nCOMPLETE STAGE 2 OUTPUT\n{s2}\n\nUse supplied source files with the Python tool and create the required Word artifact(s).'
            s3,r3,artifacts=self.retry(lambda:self.ai.stage3(self.prompts.read('#Prompt3.md',work),input3,source_paths,work/'generated',a.web_search)); responses.append(r3); (work/'stage3.md').write_text(s3,encoding='utf-8')
            cost=usage_cost(responses)
            if cost>self.s.cost_hard_stop_usd: raise RuntimeError(f'Estimated token cost ${cost:.2f} exceeds hard stop.')
            final=work/'final'; company=a.company.replace('/','-'); role=a.designation.replace('/','-')
            cv,cl=normalize(artifacts,f'Abhishek_Nair_{company}_{role}_CV.docx',f'Abhishek_Nair_{company}_{role}_Cover_Letter.docx' if a.make_cl else None,final)
            self.sheet.update(a.row_number,{'workflow':'QA'}); one_page(cv,work/'rendered')
            if cl: one_page(cl,work/'rendered')
            folder,_=self.drive.folder(f'{a.application_id} - {a.company} - {a.designation}',self.s.drive_output_folder_id)
            _,cv_link=self.drive.upload(cv,folder); cl_link=''
            if cl: _,cl_link=self.drive.upload(cl,folder)
            for audit in ['stage1.md','stage2.md','stage3.md']: self.drive.upload(work/audit,folder)
            context=write_context(work/'Application_Context.md',a,s1,s2,s3,cv,cv_link); _,context_link=self.drive.upload(context,folder)
            self.sheet.done(a,cv_link,cl_link,context_link,cost)
        except QAError as e: self.sheet.fail(a,str(e),'ERROR_MANUAL')
        except Exception as e: self.sheet.fail(a,f'{type(e).__name__}: {e}')
