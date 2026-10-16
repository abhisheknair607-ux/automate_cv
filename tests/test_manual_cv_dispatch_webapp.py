from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SERVER = (ROOT / 'webapp' / 'Code.gs').read_text(encoding='utf-8')
CLIENT = (ROOT / 'webapp' / 'Index.html').read_text(encoding='utf-8')
CONTROLLED = (ROOT / '.github' / 'workflows' / 'controlled-cv-test.yml').read_text(encoding='utf-8')

def test_manual_cv_dispatch_requires_server_side_secret_and_confirmed_exact_row():
    assert 'function runCvApiNow(payload)' in SERVER
    assert "authorise_();" in SERVER
    assert "if (payload.confirm !== true)" in SERVER
    assert "expected_(sh, payload.row, 3, payload.expected)" in SERVER
    assert "getProperty('GITHUB_WORKFLOW_TOKEN')" in SERVER
    assert "getProperty('OPENAI_API_KEY')" not in SERVER
    assert 'controlled-cv-test.yml/dispatches' in SERVER
    assert "inputs: {row_number: String(row), candidate: candidate.toLowerCase(), web_search: webEnabled ? 'true' : 'false'}" in SERVER
    assert "webEnabled!==payload.expectedWeb" in SERVER
    for guard in ['!jdReady_(a[3])', '!truthy_(a[p.cv - 1])', "status === 'applied'", "preference_(a[p.notInterested - 1])==='Not Interested'", "a[p.lock - 1]", "a[p.cvLink - 1]", "statusCode !== 204", "cache.put(key, 'submitted', 300)"]:
        assert guard in SERVER, guard

def test_manual_cv_button_never_exposes_tokens_or_calls_openai_directly():
    assert 'data-action="run-cv-now"' in CLIENT
    assert "run('runCvApiNow',{candidate,row,expected:expected(job),expectedWeb:!!job.web,confirm:true})" in CLIENT
    assert "if(DEMO){toast('Preview only:" in CLIENT
    assert "OPENAI_API_KEY" not in CLIENT
    assert "GITHUB_WORKFLOW_TOKEN" not in CLIENT

def test_manual_and_hourly_workers_use_shared_concurrency():
    assert 'group: freshmal-hourly-worker' in CONTROLLED
    assert 'queue: max' in CONTROLLED
    assert 'cancel-in-progress: false' in CONTROLLED
