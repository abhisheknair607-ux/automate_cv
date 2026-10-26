"""Stage 4 Q-status proposal tests: protected data, overrides, and no deletion."""
import pytest

from automate_cv.taaza_duplicate_proposals import (
    parse_rows, proposal_plan, read_live, write_approved_q,
)


def row(company="EY", title="Finance Analyst", url=None, location="Dublin",
        jd="", pref_a="", pref_p="", status="", request="FALSE"):
    vals = [""] * 17
    vals[0] = company
    vals[1] = title
    vals[2] = url or "https://www.linkedin.com/jobs/view/4499999001"
    vals[3] = jd
    vals[4] = location
    vals[10] = request
    vals[13] = pref_a
    vals[14] = pref_p
    vals[16] = status
    return vals


def test_redundant_exact_job_is_proposed_as_reversible_dup_not_deleted():
    scan = parse_rows([row(), row(url="https://uk.linkedin.com/jobs/view/4499999001?trk=x")])
    plan = proposal_plan(scan)
    assert plan["exact_pairs"] == 1
    assert plan["proposed_hide"] == 1
    assert plan["proposals"]["Jobs!3"]["status"] == "Dup"
    assert plan["proposals"]["Jobs!3"]["matched_with"] == "Jobs!2"
    assert "delete" not in str(plan["proposals"]).lower()


def test_protected_jd_is_preserved_as_keeper():
    scan = parse_rows([row(), row(jd="Actual job description text")])
    plan = proposal_plan(scan)
    assert plan["proposed_hide"] == 1
    assert plan["proposals"]["Jobs!2"]["status"] == "Dup"
    assert "Jobs!3" not in plan["proposals"]


def test_both_rows_protected_propose_manual_review_not_hide():
    scan = parse_rows([row(pref_a="Favorite"), row(pref_p="Not Interested")])
    plan = proposal_plan(scan)
    assert plan["proposed_hide"] == 0
    assert plan["proposed_review"] == 1
    assert plan["proposals"]["Jobs!3"]["status"] == "Possible"


def test_candidate_jd_and_cv_transfer_state_must_not_be_hidden_automatically():
    scan = parse_rows([row(jd="Actual JD"), row(jd="Actual JD",request="TRUE")])
    plan = proposal_plan(scan)
    assert plan["proposed_hide"] == 0
    assert plan["proposed_review"] == 1


def test_manual_not_dup_override_is_respected_on_future_scans():
    scan = parse_rows([row(), row(status="Not Dup")])
    plan = proposal_plan(scan)
    assert plan["proposals"] == {}


def test_manual_dup_override_is_not_replaced():
    scan = parse_rows([row(), row(status="Dup")])
    assert proposal_plan(scan)["proposals"] == {}


def test_cross_platform_similar_vacancy_is_review_only():
    scan = parse_rows([
        row(company="EY", title="Senior Transfer Pricing Consultant"),
        row(company="Ernst & Young", title="Senior Transfer Pricing Consultant",
            location="Dublin, County Dublin",url="https://ie.indeed.com/viewjob?jk=0536af9cba329ebb")
    ])
    plan = proposal_plan(scan)
    assert plan["exact_pairs"] == 0
    assert plan["possible_pairs"] == 1
    assert plan["proposed_review"] == 2
    assert plan["proposed_hide"] == 0


def test_different_job_ids_same_title_not_exact():
    scan = parse_rows([row(), row(url="https://www.linkedin.com/jobs/view/4499999002")])
    plan = proposal_plan(scan)
    assert plan["exact_pairs"] == 0
    assert plan["proposed_hide"] == 0


def test_unexpected_Q_value_fail_closed():
    with pytest.raises(ValueError,match="Unknown duplicate status"):
        parse_rows([row(status="Deleted")])


class FakeSheets:
    def __init__(self,records):
        self.records=records
        self.calls=[]
        self.changes=False

    def spreadsheets(self):
        return self

    def values(self):
        return self

    def get(self, **kwargs):
        self.calls.append(("GET", kwargs.get("range")))
        if "range" not in kwargs:
            return Response({"sheets":[{"properties":{
                "title":"Jobs","gridProperties":{"rowCount":20}}}]})
        r=kwargs["range"]
        if r=="'Jobs'!A1:Q1":
            return Response({"values":[[
                "Company Name","Designation","Link","Job Description","Location",
                "", "", "", "", "", "", "", "", "", "", "", "Duplicate Status"
            ]]})
        if r=="'Jobs'!A2:Q20":
            items=[list(x) for x in self.records]
            if self.changes:
                items[1][13]="Favorite"
            return Response({"values":items})
        raise AssertionError(r)

    def batchUpdate(self,**kwargs):
        self.calls.append(("WRITE",kwargs.get("body")))
        return Response({"totalUpdatedCells":len(kwargs["body"]["data"])})


class Response:
    def __init__(self,payload):
        self.payload=payload

    def execute(self,**kwargs):
        return self.payload


def test_live_preview_reads_A_to_Q_without_any_write():
    fake=FakeSheets([row(),row()])
    data=read_live(fake)
    plan=proposal_plan(data)
    assert plan["proposed_hide"]==1
    assert all(x[0]=="GET" for x in fake.calls)


def test_q_update_requires_explicit_flag(monkeypatch):
    fake=FakeSheets([row(),row()])
    baseline=read_live(fake)
    plan=proposal_plan(baseline)
    monkeypatch.delenv("GARAMAAL_DEDUPE_STATUS_APPROVED",raising=False)
    with pytest.raises(RuntimeError,match="not enabled"):
        write_approved_q(fake,baseline,plan)
    assert not any(action=="WRITE" for action,_ in fake.calls)


def test_approved_write_is_reversible_and_only_touches_Q(monkeypatch):
    fake=FakeSheets([row(),row()])
    baseline=read_live(fake)
    plan=proposal_plan(baseline)
    monkeypatch.setenv("GARAMAAL_DEDUPE_STATUS_APPROVED","true")
    assert write_approved_q(fake,baseline,plan)==1
    actions=[x for x in fake.calls if x[0]=="WRITE"]
    assert len(actions)==1
    assert actions[0][1]["data"]==[{"range":"'Jobs'!Q3","values":[["Dup"]]}]
    assert all("delete" not in x[0].lower() for x in fake.calls)


def test_stale_preference_refuses_approved_batch(monkeypatch):
    fake=FakeSheets([row(),row()])
    baseline=read_live(fake)
    plan=proposal_plan(baseline)
    fake.changes=True
    monkeypatch.setenv("GARAMAAL_DEDUPE_STATUS_APPROVED","true")
    with pytest.raises(RuntimeError,match="changed during scan"):
        write_approved_q(fake,baseline,plan)
    assert not any(action=="WRITE" for action,_ in fake.calls)
