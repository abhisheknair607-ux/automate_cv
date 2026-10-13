"""Run the webapp's simulated Google Sheets safety tests without an API key."""
import shutil
import subprocess
from pathlib import Path
import pytest


def test_candidate_not_interested_webapp():
    node=shutil.which('node')
    if not node:
        pytest.skip('Node.js not available')
    root=Path(__file__).resolve().parents[1]
    script=root/'webapp'/'tests'/'not_interested.test.js'
    completed=subprocess.run([node, str(script)],cwd=root, capture_output=True,
                             text=True,timeout=40)
    assert completed.returncode==0, (completed.stdout+'\\n'+completed.stderr)
    assert 'PASS:' in completed.stdout
