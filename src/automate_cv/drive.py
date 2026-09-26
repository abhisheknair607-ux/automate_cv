import io, mimetypes
from pathlib import Path
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload, MediaIoBaseDownload

class Drive:
    def __init__(self,credentials): self.files=build('drive','v3',credentials=credentials,cache_discovery=False).files()
    def metadata(self,file_id): return self.files.get(fileId=file_id,fields='id,name,mimeType,webViewLink').execute()
    def download(self,file_id,destination):
        destination=Path(destination); destination.parent.mkdir(parents=True,exist_ok=True)
        request=self.files.get_media(fileId=file_id)
        with destination.open('wb') as fh:
            d=MediaIoBaseDownload(fh,request); done=False
            while not done: _,done=d.next_chunk()
        return destination
    def download_named(self,file_id,directory):
        m=self.metadata(file_id); return self.download(file_id,Path(directory)/m['name'])
    def folder(self,name,parent):
        r=self.files.create(body={'name':name,'mimeType':'application/vnd.google-apps.folder','parents':[parent]},fields='id,webViewLink').execute(); return r['id'],r.get('webViewLink','')
    def upload(self,path,parent):
        path=Path(path); mime=mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
        r=self.files.create(body={'name':path.name,'parents':[parent]},media_body=MediaFileUpload(str(path),mimetype=mime,resumable=True),fields='id,webViewLink').execute(); return r['id'],r.get('webViewLink','')
    def find(self,name,folders):
        escaped=name.replace("'","\\'")
        for folder in folders:
            if not folder: continue
            r=self.files.list(q=f"'{folder}' in parents and name = '{escaped}' and trashed = false",fields='files(id,name,mimeType,webViewLink)',pageSize=10).execute().get('files',[])
            if r: return r[0]
        return None
