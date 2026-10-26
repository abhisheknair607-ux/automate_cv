"""Read-only and Q-only safety checks for historical Taaza duplicate proposals."""
import pytest

from automate_cv import taaza_duplicate_proposals as dup

URL_A = "https://ie.linkedin.com/jobs/view/4499999001?trk=email"
URL_B = "https://www.linkedin.com/comm/jobs/view/4499999001/?utm_source=mail"


def row(url, *, jd="", preference="", status=""):
    values = ["EY", "Transfer Pricing Analyst", url, jd, "Dublin, Ireland"] + [""] * 12
    values[13] = preference
    values[16] = status
    return values


class Sheets:
    def __init__(self):
        self.writes = []

    def spreadsheets(self):
        return self

    def values(self):
        return self

    def batchUpdate(self, **kwargs):
        self.writes.append(kwargs)
        return self

    def execute(self, **kwargs):
        return {}


def test_exact_duplicate_proposal_hides_only_unprotected_extra_row():
    rows = dup.parse_rows([row(URL_A), row(URL_B)])
    plan = dup.proposal_plan(rows)
    assert plan["proposed_hide"] == 1
    assert plan["proposed_review"] == 0
    assert plan["proposals"]["Jobs!3"]["status"] == "Dup"
    assert "Jobs!2" not in plan["proposals"]


def test_candidate_preference_or_job_description_forces_review():
    rows = dup.parse_rows([
        row(URL_A, jd="Verified job description"),
        row(URL_B, preference="Favorite"),
    ])
    plan = dup.proposal_plan(rows)
    assert plan["proposed_hide"] == 0
    assert plan["proposed_review"] == 1
    assert plan["proposals"]["Jobs!3"]["status"] == "Possible"


def test_manual_not_dup_decision_is_not_overwritten():
    rows = dup.parse_rows([row(URL_A, status="Not Dup"), row(URL_B)])
    plan = dup.proposal_plan(rows)
    assert "Jobs!2" not in plan["proposals"]


def test_write_gate_and_q_only_update(monkeypatch):
    rows = dup.parse_rows([row(URL_A), row(URL_B)])
    plan = dup.proposal_plan(rows)
    sheets = Sheets()
    monkeypatch.delenv("GARAMAAL_DEDUPE_STATUS_APPROVED", raising=False)
    with pytest.raises(RuntimeError, match="Approval flag"):
        dup.write_approved_q(sheets, rows, plan)
    assert sheets.writes == []

    monkeypatch.setenv("GARAMAAL_DEDUPE_STATUS_APPROVED", "true")
    monkeypatch.setattr(dup, "read_live", lambda _sheets: list(rows))
    assert dup.write_approved_q(sheets, rows, plan) == 1
    assert len(sheets.writes) == 1
    body = sheets.writes[0]["body"]
    assert body["data"] == [{"range": "'Jobs'!Q3", "values": [["Dup"]]}]
    assert body["valueInputOption"] == "RAW"


def test_changed_job_row_blocks_the_entire_write(monkeypatch):
    rows = dup.parse_rows([row(URL_A), row(URL_B)])
    changed = dup.parse_rows([row(URL_A), row("https://www.linkedin.com/jobs/view/4499999002")])
    plan = dup.proposal_plan(rows)
    sheets = Sheets()
    monkeypatch.setenv("GARAMAAL_DEDUPE_STATUS_APPROVED", "true")
    monkeypatch.setattr(dup, "read_live", lambda _sheets: changed)
    with pytest.raises(RuntimeError, match="changed during scan"):
        dup.write_approved_q(sheets, rows, plan)
    assert sheets.writes == []
