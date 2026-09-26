import hashlib
from googleapiclient.discovery import build
from .models import ApplicationRow

COL = {'company':0,'designation':1,'link':2,'jd':3,'cv':7,'cl':8,'ws':9,'status':11,'id':12,'hash':13,'workflow':14,'lock':15,'cvlink':17,'cllink':18,'context':19,'cost':20,'error':21}

def digest(text):
    return hashlib.sha256(text.replace('\r\n','\n').strip().encode()).hexdigest()

def _v(row,index,default=''):
    return row[index] if index < len(row) else default

def _b(row,index):
    value=_v(row,index,False)
    return value is True or str(value).upper() in {'TRUE','YES','1'}

class Freshmal:
    def __init__(self, credentials, settings):
        self.settings=settings
        self.values=build('sheets','v4',credentials=credentials,cache_discovery=False).spreadsheets().values()

    def rows(self):
        result=self.values.get(spreadsheetId=self.settings.freshmal_spreadsheet_id,range=f'{self.settings.freshmal_sheet_name}!A3:V1000',valueRenderOption='UNFORMATTED_VALUE').execute()
        apps=[]
        for number,row in enumerate(result.get('values',[]),3):
            apps.append(ApplicationRow(number,str(_v(row,0)),str(_v(row,1)),str(_v(row,2)),str(_v(row,3)),_b(row,7),_b(row,8),_b(row,9),str(_v(row,11)),str(_v(row,12)),str(_v(row,13)),str(_v(row,14)),str(_v(row,15)),str(_v(row,17)),str(_v(row,18)),str(_v(row,19)),float(_v(row,20,0) or 0),str(_v(row,21))))
        return apps

    def eligible(self, app):
        return app.make_cv and not app.complete() and not app.lock_id
