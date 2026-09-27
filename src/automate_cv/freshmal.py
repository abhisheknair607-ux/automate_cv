import hashlib, uuid
from datetime import datetime, timezone
from googleapiclient.discovery import build
from .models import ApplicationRow
from .profiles import profiles

STOP_STATES={'ERROR_MANUAL','ERROR_CONFIG','JD_CHANGED_REVIEW_REQUIRED','ERROR_MAX_RETRIES'}
STATE_KEYS=('id','hash','workflow','lock','last','cvlink','cllink','context','cost','error')

def digest(text): return hashlib.sha256(text.replace('\r\n','\n').strip().encode()).hexdigest()
def _v(row,i,d=''): return row[i] if i<len(row) else d
def _b(row,i):
    value=_v(row,i,False); return value is True or str(value).upper() in {'TRUE','YES','1'}
def col_letter(index):
    n=index+1; s=''
    while n: n,r=divmod(n-1,26); s=chr(65+r)+s
    return s

def retry_count(workflow):
    if not workflow.startswith('ERROR_RETRYABLE_'): return 0
    try: return int(workflow.rsplit('_',1)[1])
    except ValueError: return 0

class Freshmal:
    def __init__(self,credentials,settings):
        self.settings=settings; self.values=build('sheets','v4',credentials=credentials,cache_discovery=False).spreadsheets().values(); self.profiles=profiles()
    def rows(self):
        result=self.values.get(spreadsheetId=self.settings.freshmal_spreadsheet_id,range=f'{self.settings.freshmal_sheet_name}!A3:AF1000',valueRenderOption='UNFORMATTED_VALUE').execute(); apps=[]
        for n,row in enumerate(result.get('values',[]),3):
            company,designation,link,jd=map(str,(_v(row,0),_v(row,1),_v(row,2),_v(row,3)))
            for p in self.profiles.values():
                make_cv,make_cl,ws=_b(row,p.make_cv_col),_b(row,p.make_cl_col),_b(row,p.web_search_col)
                if not (make_cv or make_cl or ws): continue
                state=[_v(row,p.state_start_col+i) for i in range(10)]
                apps.append(ApplicationRow(n,company,designation,link,jd,make_cv,make_cl,ws,str(_v(row,p.status_col)),p.key,p.display_name,p.filename_name,p.folder_name,'',str(state[0]),str(state[1]),str(state[2]),str(state[3]),str(state[5]),str(state[6]),str(state[7]),float(state[8] or 0),str(state[9])))
        return apps
    def _profile(self,a): return self.profiles[a.candidate_key]
    def _lock_stale(self,lock):
        if not lock or '|' not in lock: return False
        try:
            stamp=datetime.fromisoformat(lock.split('|',1)[1]); age=(datetime.now(timezone.utc)-stamp).total_seconds()/60
            return age>=self.settings.stale_lock_minutes
        except Exception: return False
    def eligible(self,a):
        if not a.make_cv or a.complete() or a.workflow in STOP_STATES: return False
        if retry_count(a.workflow)>=self.settings.max_row_attempts: return False
        if a.lock_id and not self._lock_stale(a.lock_id): return False
        return True
    def update(self,a,changes):
        p=self._profile(a); mapping={'status':p.status_col}
        mapping.update({k:p.state_start_col+i for i,k in enumerate(STATE_KEYS)})
        data=[{'range':f'{self.settings.freshmal_sheet_name}!{col_letter(mapping[k])}{a.row_number}','values':[[v]]} for k,v in changes.items()]
        self.values.batchUpdate(spreadsheetId=self.settings.freshmal_spreadsheet_id,body={'valueInputOption':'RAW','data':data}).execute()
    def prepare(self,a):
        d=digest(a.raw_jd)
        if a.jd_hash and a.jd_hash!=d:
            self.update(a,{'hash':d,'status':'NA','workflow':'JD_CHANGED_REVIEW_REQUIRED','error':'JD changed; review the row and re-check Make CV.'}); return False
        if not a.application_id: a.application_id=f'{a.candidate_key.upper()}-R{a.row_number}-{d[:8]}'
        a.jd_hash=d; self.update(a,{'id':a.application_id,'hash':d}); return True
    def claim(self,a):
        now=datetime.now(timezone.utc).isoformat(); lock=f'{uuid.uuid4()}|{now}'
        self.update(a,{'lock':lock,'workflow':'CLAIMED','last':now,'error':''}); a.lock_id=lock
    def fail(self,a,msg,state='ERROR_RETRYABLE'):
        if state=='ERROR_RETRYABLE':
            count=retry_count(a.workflow)+1
            state='ERROR_MAX_RETRIES' if count>=self.settings.max_row_attempts else f'ERROR_RETRYABLE_{count}'
        self.update(a,{'workflow':state,'error':msg[:5000],'lock':''})
    def done(self,a,cv,cl,context,cost): self.update(a,{'status':a.requested_status(),'workflow':'COMPLETE','cvlink':cv,'cllink':cl,'context':context,'cost':round(cost,4),'error':'','lock':''})
