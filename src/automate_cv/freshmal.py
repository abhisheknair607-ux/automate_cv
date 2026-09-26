import hashlib, uuid
from datetime import datetime, timezone
from googleapiclient.discovery import build
from .models import ApplicationRow

COL={'company':0,'designation':1,'link':2,'jd':3,'cv':7,'cl':8,'ws':9,'status':11,'id':12,'hash':13,'workflow':14,'lock':15,'cvlink':17,'cllink':18,'context':19,'cost':20,'error':21}
LET={'cv':'H','status':'L','id':'M','hash':'N','workflow':'O','lock':'P','last':'Q','cvlink':'R','cllink':'S','context':'T','cost':'U','error':'V'}
def digest(text): return hashlib.sha256(text.replace('\r\n','\n').strip().encode()).hexdigest()
def _v(row,i,d=''): return row[i] if i<len(row) else d
def _b(row,i):
    value=_v(row,i,False); return value is True or str(value).upper() in {'TRUE','YES','1'}

class Freshmal:
    def __init__(self,credentials,settings):
        self.settings=settings; self.values=build('sheets','v4',credentials=credentials,cache_discovery=False).spreadsheets().values()
    def rows(self):
        result=self.values.get(spreadsheetId=self.settings.freshmal_spreadsheet_id,range=f'{self.settings.freshmal_sheet_name}!A3:V1000',valueRenderOption='UNFORMATTED_VALUE').execute(); apps=[]
        for n,row in enumerate(result.get('values',[]),3):
            apps.append(ApplicationRow(n,str(_v(row,0)),str(_v(row,1)),str(_v(row,2)),str(_v(row,3)),_b(row,7),_b(row,8),_b(row,9),str(_v(row,11)),str(_v(row,12)),str(_v(row,13)),str(_v(row,14)),str(_v(row,15)),str(_v(row,17)),str(_v(row,18)),str(_v(row,19)),float(_v(row,20,0) or 0),str(_v(row,21))))
        return apps
    def eligible(self,a): return a.make_cv and not a.complete() and not a.lock_id
    def update(self,row,changes):
        data=[{'range':f'{self.settings.freshmal_sheet_name}!{LET[k]}{row}','values':[[v]]} for k,v in changes.items()]
        self.values.batchUpdate(spreadsheetId=self.settings.freshmal_spreadsheet_id,body={'valueInputOption':'RAW','data':data}).execute()
    def prepare(self,a):
        d=digest(a.raw_jd)
        if a.jd_hash and a.jd_hash!=d:
            self.update(a.row_number,{'cv':False,'hash':d,'status':'NA','workflow':'JD_CHANGED_REVIEW_REQUIRED','error':'JD changed; review A:D and re-check Make CV.'}); return False
        if not a.application_id: a.application_id=f'ABH-R{a.row_number}-{d[:8]}'
        a.jd_hash=d; self.update(a.row_number,{'id':a.application_id,'hash':d}); return True
    def claim(self,a):
        lock=f'{uuid.uuid4()}|{datetime.now(timezone.utc).isoformat()}'
        self.update(a.row_number,{'lock':lock,'workflow':'CLAIMED','last':datetime.now(timezone.utc).isoformat(),'error':''}); a.lock_id=lock
    def fail(self,a,msg,state='ERROR_RETRYABLE'): self.update(a.row_number,{'workflow':state,'error':msg[:5000],'lock':''})
    def done(self,a,cv,cl,context,cost): self.update(a.row_number,{'status':a.requested_status(),'workflow':'COMPLETE','cvlink':cv,'cllink':cl,'context':context,'cost':round(cost,4),'error':'','lock':''})
