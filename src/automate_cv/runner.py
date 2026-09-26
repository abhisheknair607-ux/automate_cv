import argparse
from pathlib import Path
from .config import settings
from .google_auth import credentials
from .freshmal import Freshmal
from .drive import Drive
from .prompts import Prompts
from .openai_client import AI
from .workflow import Workflow

def build():
    creds=credentials(settings); sheet=Freshmal(creds,settings); drive=Drive(creds); root=Path(__file__).resolve().parents[2]
    return sheet,Workflow(settings,sheet,drive,AI(settings),Prompts(drive,settings,root))

def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--dry-run',action='store_true'); args=parser.parse_args()
    if not settings.automation_enabled and not args.dry_run:
        print('AUTOMATION_ENABLED=false; no work performed.'); return
    sheet,workflow=build(); apps=[a for a in sheet.rows() if sheet.eligible(a)][:settings.max_applications_per_run]
    if args.dry_run:
        for a in apps: print(a.row_number,a.company,a.designation,'CL=',a.make_cl,'WS=',a.web_search)
        return
    for app in apps: workflow.run(app)

if __name__=='__main__': main()
