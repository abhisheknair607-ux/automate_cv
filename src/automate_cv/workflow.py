import time
from pathlib import Path
from .context import write_context
from .qa import normalize, one_page, QAError
from .sources import Sources

class Workflow:
    def __init__(self,settings,freshmal,drive,ai,prompts):
        self.s=settings; self.sheet=freshmal; self.drive=drive; self.ai=ai; self.prompts=prompts; self.sources=Sources(drive,settings)
    def retry(self,fn):
        for attempt in range(self.s.max_retries+1):
            try: return fn()
            except Exception:
                if attempt>=self.s.max_retries: raise
                time.sleep(min(2**(attempt+1),10))
