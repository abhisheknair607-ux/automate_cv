from pathlib import Path
import pytest

from automate_cv.prompts import Prompts


class FakeDrive:
    def __init__(self, text):
        self.text = text

    def download(self, file_id, destination):
        destination = Path(destination)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(self.text, encoding='utf-8')
        return destination


class FakeSettings:
    prompt1_file_id = 'p1'
    prompt2_file_id = 'p2'
    prompt3_file_id = 'p3'


def root_with_controls(tmp_path):
    prompt_dir = tmp_path / 'prompts'
    prompt_dir.mkdir()
    (prompt_dir / '03_automation_controls.md').write_text('AUTOMATION CONTROLS', encoding='utf-8')
    return tmp_path


def test_prompt2_adds_router_context_contract(tmp_path, monkeypatch):
    monkeypatch.setenv('PROMPT1_FILE_ID', 'p1')
    monkeypatch.setenv('PROMPT2_FILE_ID', 'p2')
    monkeypatch.setenv('PROMPT3_FILE_ID', 'p3')
    prompts = Prompts(FakeDrive('STAGE 2 BASE'), FakeSettings(), root_with_controls(tmp_path))
    result = prompts.read('abhishek', '#Prompt2.md', tmp_path / 'work')
    assert 'STAGE 2 BASE' in result
    assert 'Automation Context Contract — Stage 2 v2' in result
    assert 'Treat that router as available' in result
    assert 'STAGE2_HANDOFF' in result


def test_prompt3_controls_insert_before_authoritative_marker(tmp_path, monkeypatch):
    monkeypatch.setenv('PROMPT1_FILE_ID', 'p1')
    monkeypatch.setenv('PROMPT2_FILE_ID', 'p2')
    monkeypatch.setenv('PROMPT3_FILE_ID', 'p3')
    text = 'START\n# Authoritative Inputs and Stage Handoff\nEND'
    prompts = Prompts(FakeDrive(text), FakeSettings(), root_with_controls(tmp_path))
    result = prompts.read('abhishek', '#Prompt3.md', tmp_path / 'work')
    assert result.index('AUTOMATION CONTROLS') < result.index('# Authoritative Inputs and Stage Handoff')


def test_prompt3_missing_marker_fails_closed(tmp_path, monkeypatch):
    monkeypatch.setenv('PROMPT1_FILE_ID', 'p1')
    monkeypatch.setenv('PROMPT2_FILE_ID', 'p2')
    monkeypatch.setenv('PROMPT3_FILE_ID', 'p3')
    prompts = Prompts(FakeDrive('NO MARKER'), FakeSettings(), root_with_controls(tmp_path))
    with pytest.raises(RuntimeError, match='insertion marker'):
        prompts.read('abhishek', '#Prompt3.md', tmp_path / 'work')


def test_pooja_original_prompt_accepts_jd_marker(tmp_path, monkeypatch):
    monkeypatch.setenv('POOJA_PROMPT3_FILE_ID', 'p3')
    prompts = Prompts(FakeDrive('START\n# Job Description\nEND'), FakeSettings(), root_with_controls(tmp_path))
    result = prompts.read('pooja', '#Prompt3.md', tmp_path / 'work')
    assert result.index('AUTOMATION CONTROLS') < result.index('# Job Description')


def test_abhishek_prompt2_adds_ai_and_metric_evidence_rules(tmp_path, monkeypatch):
    monkeypatch.setenv('PROMPT1_FILE_ID', 'p1')
    monkeypatch.setenv('PROMPT2_FILE_ID', 'p2')
    monkeypatch.setenv('PROMPT3_FILE_ID', 'p3')
    prompts = Prompts(FakeDrive('STAGE 2 BASE'), FakeSettings(), root_with_controls(tmp_path))
    result = prompts.read('abhishek', '#Prompt2.md', tmp_path / 'work')
    assert 'Abhishek AI, Automation and Quantified-Impact Addendum' in result
    assert 'roughly 60-80%' in result
    assert 'selected_professional_evidence.supported_metrics' in result
    assert 'Never convert an approximate or ranged figure into a false exact' in result


def test_abhishek_prompt3_adds_ai_and_metric_generation_rules(tmp_path, monkeypatch):
    monkeypatch.setenv('PROMPT1_FILE_ID', 'p1')
    monkeypatch.setenv('PROMPT2_FILE_ID', 'p2')
    monkeypatch.setenv('PROMPT3_FILE_ID', 'p3')
    text = 'START\n# Authoritative Inputs and Stage Handoff\nEND'
    prompts = Prompts(FakeDrive(text), FakeSettings(), root_with_controls(tmp_path))
    result = prompts.read('abhishek', '#Prompt3.md', tmp_path / 'work')
    assert result.index('AUTOMATION CONTROLS') < result.index('# Authoritative Inputs and Stage Handoff')
    assert result.index('Abhishek AI, Automation and Quantified-Impact Addendum') < result.index('# Authoritative Inputs and Stage Handoff')
    assert 'Include at least one concise AI/automation signal somewhere in the final CV' in result


def test_pooja_prompt3_does_not_receive_abhishek_ai_metric_addendum(tmp_path, monkeypatch):
    monkeypatch.setenv('POOJA_PROMPT3_FILE_ID', 'p3')
    prompts = Prompts(FakeDrive('START\n# Job Description\nEND'), FakeSettings(), root_with_controls(tmp_path))
    result = prompts.read('pooja', '#Prompt3.md', tmp_path / 'work')
    assert 'Abhishek AI, Automation and Quantified-Impact Addendum' not in result


def test_abhishek_metric_policy_preserves_strong_non_quantified_evidence(tmp_path, monkeypatch):
    monkeypatch.setenv('PROMPT1_FILE_ID', 'p1')
    monkeypatch.setenv('PROMPT2_FILE_ID', 'p2')
    monkeypatch.setenv('PROMPT3_FILE_ID', 'p3')
    prompts = Prompts(FakeDrive('STAGE 2 BASE'), FakeSettings(), root_with_controls(tmp_path))

    stage2 = prompts.read('abhishek', '#Prompt2.md', tmp_path / 'work2')
    assert 'Numbers are an enhancement, not an eligibility requirement' in stage2
    assert 'Quantification is a tie-breaker or strengthening factor only' in stage2
    assert 'supported_metrics is empty' in stage2
    assert 'Relevance and factual strength always outrank numeric density' in stage2

    stage3_text = 'START\n# Authoritative Inputs and Stage Handoff\nEND'
    (tmp_path / 'root3').mkdir()
    stage3_prompts = Prompts(FakeDrive(stage3_text), FakeSettings(), root_with_controls(tmp_path / 'root3'))
    stage3 = stage3_prompts.read('abhishek', '#Prompt3.md', tmp_path / 'work3')
    assert 'absence of a metric is never, by itself, a reason to' in stage3
    assert 'drop a selected fact from the CV' in stage3
