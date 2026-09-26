import shutil, subprocess
from pathlib import Path
from pypdf import PdfReader

class QAError(RuntimeError): pass

def normalize(artifacts,cv_name,cl_name,output_dir):
    output_dir=Path(output_dir); output_dir.mkdir(parents=True,exist_ok=True)
    docs=[Path(p) for p in artifacts if str(p).lower().endswith('.docx')]
    cv=[p for p in docs if 'cover' not in p.name.lower() and 'letter' not in p.name.lower()]
    if not cv: raise QAError('Stage 3 produced no CV DOCX.')
    cv_target=output_dir/cv_name; shutil.copy2(cv[0],cv_target); cl_target=None
    if cl_name:
        cl=[p for p in docs if p!=cv[0] and ('cover' in p.name.lower() or 'letter' in p.name.lower())]
        if not cl: raise QAError('Cover letter requested but no cover-letter DOCX was produced.')
        cl_target=output_dir/cl_name; shutil.copy2(cl[0],cl_target)
    return cv_target,cl_target

def one_page(docx,render_dir):
    render_dir=Path(render_dir); render_dir.mkdir(parents=True,exist_ok=True)
    r=subprocess.run(['libreoffice','--headless','--convert-to','pdf','--outdir',str(render_dir),str(docx)],capture_output=True,text=True,timeout=120)
    if r.returncode: raise QAError(r.stderr or 'LibreOffice rendering failed.')
    pdf=render_dir/(Path(docx).stem+'.pdf')
    if not pdf.exists(): raise QAError('Rendered PDF missing.')
    pages=len(PdfReader(str(pdf)).pages)
    if pages!=1: raise QAError(f'{Path(docx).name} rendered to {pages} pages; expected 1.')
