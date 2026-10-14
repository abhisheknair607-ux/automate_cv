"""Non-paid regression tests for the periodic master mirror."""
import re

from automate_cv import taaza_sync


class FakeSheets:
    def __init__(self):
        self.book = {
            "Jobs": [
                ["Alpha", "Existing", "https://example.org/1?utm_source=first"] + [""] * 10,
            ],
            "TP Europe": [
                ["Alpha", "Existing", "https://www.example.org/1?utm_campaign=elsewhere"] + [""] * 10,
                ["EUTP", "TP senior", "https://eu.example/transfer-pricing", "JD", "Paris"] + [""] * 8,
            ],
            "Pooja Europe": [
                ["Planner", "Paraplanner", "https://eu.example/planning", "JD", "Amsterdam"] + [""] * 8,
                ["Duplicate", "Duplicate", "https://eu.example/transfer-pricing"] + [""] * 10,
            ],
            "Alert Setup": [
                ["Config", "Alert", "https://eu.example/wrong"] + [""] * 10,
            ],
        }
        self.calls = []
        self.previous = None

    def spreadsheets(self):
        return self

    def values(self):
        return self

    def get(self, **args):
        self.calls.append(("get", args))
        if "fields" in args:
            if "sheetId" in args["fields"]:
                result = {"sheets": [{"properties": {"title": name, "sheetId": i}}
                                    for i, name in enumerate(self.book, 1)]}
            else:
                result = {"sheets": [{"properties": {
                    "title": name, "gridProperties": {"rowCount": 1000}}}
                    for name in self.book]}
        else:
            name, start, end = self._parse(args["range"])
            section = self.book[name][start - 2: end - 1 if end is not None else None]
            result = {"values": section}
        self.previous = result
        return self

    def update(self, **kwargs):
        self.calls.append(("update", kwargs))
        name, start, end = self._parse(kwargs["range"])
        assert name == "Jobs"
        assert end == start + len(kwargs["body"]["values"]) - 1
        for i, values in enumerate(kwargs["body"]["values"]):
            slot = start - 2 + i
            while len(self.book[name]) <= slot:
                self.book[name].append([])
            self.book[name][slot] = list(values)
        self.previous = {"updatedRows": len(kwargs["body"]["values"])}
        return self

    def execute(self):
        return self.previous

    @staticmethod
    def _parse(text):
        found = re.match(r"'([^']+)'!A(\d+):M(\d+)?", text)
        assert found, text
        return found[1], int(found[2]), int(found[3]) if found[3] else None


def test_only_missing_canonical_links_are_added_with_true_origin():
    master = [["A", "Title", "http://www.jobs.test/job/?utm_source=partner"]]
    sources = {
        "TP Europe": [
            ["A", "duplicate", "https://jobs.test/job?utm_campaign=other"],
            ["B", "TP", "https://jobs.test/new", "full JD"],
        ],
        "Pooja Europe": [
            ["B", "duplicate", "https://jobs.test/new"],
            ["C", "Planner", "https://jobs.test/wealth"],
        ],
    }
    add, counts = taaza_sync.candidates(master, sources)
    assert counts == {"TP Europe": 1, "Pooja Europe": 1}
    assert [row[0] for row in add] == ["B", "C"]
    assert [row[12] for row in add] == ["TP Europe", "Pooja Europe"]
    assert all(row[10] is False for row in add)


def test_sync_is_idempotent_ignores_alert_tabs_and_never_rewrites_existing():
    sheet = FakeSheets()
    first = taaza_sync.sync_once(sheet)
    assert first["added"] == 2
    assert first["master_row"] == 3
    assert len(sheet.book["Jobs"]) == 3
    assert sheet.book["Jobs"][0][0] == "Alpha"
    assert sheet.book["Jobs"][1][10] is False
    assert sheet.book["Jobs"][2][12] == "Pooja Europe"
    assert not any("Alert Setup" in call[1].get("range", "") for call in sheet.calls)
    before = sum(name == "update" for name, _ in sheet.calls)
    second = taaza_sync.sync_once(sheet)
    assert second["added"] == 0
    assert before == sum(name == "update" for name, _ in sheet.calls)


def test_generic_europe_tab_is_mirrored_if_it_exists():
    sheet = FakeSheets()
    sheet.book["Europe"] = [["Europe Co", "Finance", "https://eur.example/finance"]]
    result = taaza_sync.sync_once(sheet)
    assert result["added"] == 3
    assert sheet.book["Jobs"][-1][12] == "Europe"


def test_invalid_missing_company_and_duplicate_urls_are_not_written():
    rows, counts = taaza_sync.candidates([], {
        "TP Europe": [
            ["", "TP", "https://eu.test/a"],
            ["Company", "TP", "not-a-url"],
            ["Company", "TP", "https://eu.test/b"],
            ["Company", "TP", "https://eu.test/b?utm_medium=ads"],
        ],
    })
    assert len(rows) == counts["TP Europe"] == 1


def test_unauthorized_email_credentials_cannot_be_derived_from_job_data():
    assert taaza_sync.canonical("javascript:alert('x')") == ""
    assert taaza_sync.canonical("https://www.example.com/path?utm_source=x&ref_src=abc") == "https://example.com/path"
