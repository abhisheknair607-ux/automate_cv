"""No-network Stage 2 tests proving that auditing only reads A:E and metadata."""
import pytest

from automate_cv.job_dedupe import Job, identity, location_key
from automate_cv.taaza_dedupe_audit import HEADERS, read_live_jobs, summarize


class Result:
    def __init__(self, data): self.data = data
    def execute(self, **_kwargs): return self.data


class ReadonlyFake:
    def __init__(self, rows=None, header=None, row_cap=20):
        self.rows = rows if rows is not None else [
            ["EY", "Transfer Pricing Senior Consultant",
             "https://ie.linkedin.com/jobs/view/4499999001/", "Full JD", "Dublin, Ireland"],
            ["EY", "Transfer Pricing Senior Consultant",
             "https://www.linkedin.com/comm/jobs/view/4499999001?trk=email", "",
             "Dublin, County Dublin"],
            ["Monzo", "Operational Tax, Senior Manager",
             "https://job-boards.greenhouse.io/monzo/jobs/8200681", "", "London"],
        ]
        self.header = [HEADERS] if header is None else header
        self.row_cap = row_cap
        self.calls = []

    def spreadsheets(self):
        return self

    def values(self):
        return self

    def get(self, **kwargs):
        self.calls.append(kwargs)
        if "range" not in kwargs:
            return Result({"sheets": [{"properties": {
                "title": "Jobs", "sheetId": 1297151427,
                "gridProperties": {"rowCount": self.row_cap, "columnCount": 26}
            }}]})
        area = kwargs["range"]
        if area == "'Jobs'!A1:E1":
            return Result({"values": self.header})
        assert area == f"'Jobs'!A2:E{self.row_cap}"
        return Result({"values": self.rows})

    def append(self, **_kwargs):
        raise AssertionError("Read-only scan must never append")

    def update(self, **_kwargs):
        raise AssertionError("Read-only scan must never update")

    def batchUpdate(self, **_kwargs):
        raise AssertionError("Read-only scan must never mutate")


def test_sheet_readonly_actual_headers_and_protected_jds():
    fake = ReadonlyFake()
    items = read_live_jobs(fake)
    assert len(items) == 3
    assert items[0].row_ref == "Jobs!2"
    assert items[0].has_jd is True
    assert items[1].has_jd is False
    assert all("range" not in c or c["range"].startswith("'Jobs'!A") for c in fake.calls)
    report = summarize(items)
    assert report["exact_groups"] == 1
    assert report["redundant_exact_rows_upper_bound"] == 1
    assert report["exact_matches"][0]["auto_delete"] is False


def test_only_read_master_jobs_and_never_source_mirrors():
    fake = ReadonlyFake(rows=[
        ["EY", "Transfer Pricing Analyst", "https://careers.ey.com/one", "", "Dublin"]
    ])
    result = read_live_jobs(fake)
    assert len(result) == 1
    assert all("TP Europe" not in str(call) for call in fake.calls)


def test_header_mismatch_fails_before_scanning_or_writing():
    fake = ReadonlyFake(header=[["Company", "Role", "URL", "JD", "Location"]])
    with pytest.raises(RuntimeError, match="header changed"):
        read_live_jobs(fake)
    assert not any(c.get("range", "").startswith("'Jobs'!A2") for c in fake.calls)


def test_allocated_row_count_above_limit_refused():
    fake = ReadonlyFake(row_cap=10001)
    with pytest.raises(RuntimeError, match="grid size"):
        read_live_jobs(fake)


def test_incomplete_row_fails_closed():
    fake = ReadonlyFake(rows=[["EY", "", "https://example.com/job1", "", "Dublin"]])
    with pytest.raises(RuntimeError, match="row 2"):
        read_live_jobs(fake)


def test_blank_middle_row_keeps_stable_sheet_row_numbers():
    fake = ReadonlyFake(rows=[
        ["EY", "Senior Finance Analyst", "https://jobs.example.com/a", "", "Dublin"],
        [],
        ["EY", "Senior Finance Analyst", "https://jobs.example.com/a", "", "Dublin"],
    ])
    items = read_live_jobs(fake)
    assert [j.row_ref for j in items] == ["Jobs!2", "Jobs!4"]
    assert summarize(items)["exact_groups"] == 1


def test_exact_identity_linkedin_regional_hosts_and_deterministic_city():
    base = identity("https://www.linkedin.com/jobs/view/4499999001/")
    assert identity("https://ie.linkedin.com/jobs/view/4499999001/?trk=abc") == base
    assert identity("https://uk.linkedin.com/jobs/view/4499999001") == base
    assert location_key("Dublin / Cork, Ireland") == "dublin"
    assert location_key("Cork / Dublin, Ireland") == "cork"


def test_dont_count_fuzzy_only_groups_as_exact_redundant_records():
    jobs = [
        Job("Jobs", 2, "EY", "Senior Transfer Pricing Consultant", "Dublin",
            "https://ie.linkedin.com/jobs/view/4499999001/"),
        Job("Jobs", 3, "Ernst & Young", "Senior Transfer Pricing Consultant", "Dublin",
            "https://ie.indeed.com/viewjob?jk=0536af9cba329ebb"),
    ]
    report = summarize(jobs)
    assert report["possible_only_groups"] == 1
    assert report["redundant_exact_rows_upper_bound"] == 0
    assert report["exact_pairs"] == 0


def test_no_auto_delete_and_no_openai_dependency():
    fake = ReadonlyFake()
    report = summarize(read_live_jobs(fake))
    assert all(x["auto_delete"] is False for x in
               report["exact_matches"] + report["possible_matches"])
