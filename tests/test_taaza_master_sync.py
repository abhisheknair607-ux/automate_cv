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
        self.categories = {}
        self.dropdown_options = []

    def spreadsheets(self):
        return self

    def values(self):
        return self

    def get(self, **args):
        self.calls.append(("get", args))
        if "fields" in args:
            result = {"sheets": [{"properties": {
                "title": name, "sheetId": i, "gridProperties": {"rowCount": 1000}}}
                for i, name in enumerate(self.book, 1)]}
        else:
            if re.match(r"'Jobs'!P\d+:P\d+", args["range"]):
                first, last = map(int, re.findall(r"P(\d+)", args["range"]))
                result = {"values": [[self.categories.get(i, "")] for i in range(first, last + 1)]}
                self.previous = result
                return self
            name, start, end = self._parse(args["range"])
            if start == 1:
                header = ["Company Name", "Designation", "Link"] if name != "Alert Setup" else ["Alert", "Enabled", "Email"]
                result = {"values": [header]}
            else:
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

    def batchUpdate(self, **kwargs):
        body = kwargs["body"]
        self.calls.append(("batchUpdate", kwargs))
        if "data" in body:
            for change in body["data"]:
                first, last = map(int, re.findall(r"P(\d+)", change["range"]))
                for row, value in enumerate(change["values"], start=first):
                    self.categories[row] = value[0]
                assert last == first + len(change["values"]) - 1
        else:
            for req in body["requests"]:
                if "repeatCell" in req:
                    assert req["repeatCell"]["range"]["startColumnIndex"] == 15
                    self.dropdown_options = [v["userEnteredValue"] for v in
                                             req["repeatCell"]["cell"]["dataValidation"]
                                             ["condition"]["values"]]
        self.previous = {}
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
    assert sheet.categories[1] == 'Job Categories'
    assert sheet.categories[2] == 'Common'
    assert sheet.categories[3] == 'TP Europe'
    assert sheet.categories[4] == 'Pooja Europe'
    assert 'TP Europe' in sheet.dropdown_options
    assert not any("Alert Setup" in call[1].get("range", "") and "!A2:" in call[1].get("range", "") for call in sheet.calls)
    before = sum(name == "update" for name, _ in sheet.calls)
    second = taaza_sync.sync_once(sheet)
    assert second["added"] == 0
    assert before == sum(name == "update" for name, _ in sheet.calls)


def test_new_or_renamed_job_tab_is_automatically_discovered():
    sheet = FakeSheets()
    sheet.book["New Role Category"] = [["NewCo", "Data", "https://new.example/job"]]
    # A future tab is added without changing any list of tab names.
    tabs = taaza_sync.discover_job_tabs(sheet)
    assert "New Role Category" in [tab["name"] for tab in tabs]
    assert "Alert Setup" not in [tab["name"] for tab in tabs]
    result = taaza_sync.sync_once(sheet)
    assert result["added"] == 3
    del sheet.book["New Role Category"]
    sheet.book["New Role Category (Renamed)"] = [["NewCo", "Data", "https://new.example/job"]]
    assert taaza_sync.sync_once(sheet)["added"] == 0
    assert sheet.categories[4] == "New Role Category (Renamed)"


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


def test_one_job_can_belong_to_multiple_tabs_and_dropdown_lists_combination():
    book = FakeSheets()
    book.book["TP Europe"].append(
        ["Plan", "Finance", "https://eu.example/planning"])
    taaza_sync.sync_once(book)
    assert book.categories[4] == "TP Europe | Pooja Europe"
    assert "TP Europe | Pooja Europe" in book.dropdown_options
    assert "Common" in book.dropdown_options
