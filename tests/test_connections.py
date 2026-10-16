from types import SimpleNamespace

from automate_cv.connections import canonical_url, matching_rows, parse_contacts, linkedin_invitation


def example(candidate="Abhishek Nair", row=68):
    return SimpleNamespace(
        company="BDO",
        designation="International Corporate Tax Opportunities",
        candidate_name=candidate,
        row_number=row,
        application_link="https://bdoireland.pinpointhq.com/en/postings/391e7aaf-2db7-45e7-b7e9-9fbc3963f994"
    )


def record(name, candidate="Abhishek Nair", row="68", url=None):
    return ["BDO", name, "", "", "International Corporate Tax", candidate, row,
            url or example().application_link, "International Tax Director", "Public bio", "Hello", "2026-10-16"]


def test_scoped_contacts_never_leak_between_candidates_rows_or_vacancies():
    original = record("Kevin Doyle")
    rows = [original, record("Pooja Person", candidate="Pooja Tirupati"),
            record("Other Vacancy", url="https://example.com/new"),
            record("Other Row", row="69"), record("Kevin Doyle")]
    matches = matching_rows(rows, example())
    assert len(matches) == 1
    assert matches[0][1] == "Kevin Doyle"


def test_canonical_vacancy_removes_tracking_only():
    base = example().application_link
    assert canonical_url(base + "?utm_source=linkedin") == canonical_url(base)
    assert canonical_url("https://example.com/other") != canonical_url(base)


def test_pooja_is_kept_separate():
    rows = [record("Kevin Doyle"), record("Pooja Contact", candidate="Pooja Tirupati")]
    assert [x[1] for x in matching_rows(rows, example(candidate="Pooja Tirupati"))] == ["Pooja Contact"]


def test_invalid_model_research_output_is_rejected():
    import pytest
    with pytest.raises(ValueError):
        parse_contacts("not a JSON document")
    assert parse_contacts('{"contacts": []}') == []


def test_linkedin_invitation_is_warm_personal_and_formatted():
    message = linkedin_invitation("Abhishek Nair", "Kevin Doyle", "BDO",
                                  "Partner", "International Tax")
    assert message.startswith("Hi Kevin,\n\n")
    assert message.endswith("\n\nThank you — I'd be grateful to connect.")
    assert len(message.split("\n\n")) == 3
    assert all(fact in message for fact in ("ACCA member", "EY", "UCD", "International Tax"))
    assert len(message) < 300


def test_long_recipients_preserve_blank_lines_and_character_limit():
    note = linkedin_invitation(
        "Abhishek Nair", "Alexandrianna Reallylongsurname",
        "Extraordinary International Financial Services Partnership and Management Company",
        "Senior Director", "International Transfer Pricing and Financial Services Tax")
    assert len(note) < 300
    assert note.startswith("Hi Alexandrianna,\n\n")
    assert note.count("\n\n") == 2


def test_pooja_never_inherits_abhishek_credentials():
    message = linkedin_invitation("Pooja Tirupati", "Rachel Green", "BDO",
                                  "Director", "Tax Advisory")
    assert message.startswith("Hi Rachel,\n\nI'm Pooja Tirupati.")
    assert all(word not in message for word in ("Abhishek", "ACCA", "EY experience", "UCD MSc"))
    assert "Tax Advisory" in message
    assert len(message) < 300


def test_zero_contacts_attempts_one_bounded_official_fallback(monkeypatch):
    """Web selected: a failed broad search gets exactly one targeted retry."""
    from automate_cv.connections import Connections

    job = example()
    connection = Connections.__new__(Connections)
    connection._ensure = lambda: None
    connection._rows = lambda: []
    attempts = []
    def research(_ai, _job, _summary, focused=False):
        attempts.append(focused)
        return []
    connection.research = research
    result = connection.run(None, job, "ACCA member; EY experience; UCD MSc.")
    assert attempts == [False, True]
    assert result["status"] == "no_verified_contacts"
    assert result["count"] == 0
    assert result["added"] == 0
    assert result["research_calls"] == 2
    assert result["candidates"] == 0


def test_existing_networking_contacts_never_restart_paid_research():
    from automate_cv.connections import Connections
    job = example()
    connection = Connections.__new__(Connections)
    connection._ensure = lambda: None
    connection._rows = lambda: [
        record("Simon Clarke"), record("Paul Hough"), record("Jack Troak"),
        record("Kirstie O'Flanagan"), record("Liam Booth"), record("Megan Smythe"),
        record("John Doddy")
    ]
    connection.research = lambda *_args, **_kw: (_ for _ in ()).throw(
        AssertionError("Existing contacts should be reused without research"))
    result = connection.run(None,job,"")
    assert result == {"status":"already_saved","count":7,"added":0}


def test_web_networking_automatically_saves_verified_contacts_into_scoped_sheet(monkeypatch):
    """A Web-enabled completed CV produces Google Sheets records, no UI step."""
    from automate_cv.connections import Connections
    import automate_cv.connections as module

    job = example()
    memory = []
    contact = Connections.__new__(Connections)
    contact._ensure = lambda: None
    contact._rows = lambda: memory
    contact.settings = SimpleNamespace(freshmal_spreadsheet_id="test-sheet")
    seen = []
    contact.research = lambda *_args, **_kw: [
        {"name": "Kevin Doyle", "position": "Partner", "team": "International Tax",
         "location": "Dublin, Ireland",
         "confidence": "High",
         "evidence_urls": ["https://www.bdo.ie/en-gb/our-people/kevin-doyle"]}
    ]
    class SafeHttp:
        def __init__(self, **kwargs):pass
        def __enter__(self):return self
        def __exit__(self,*args):return False
    monkeypatch.setattr(module.httpx, "Client", SafeHttp)
    monkeypatch.setattr(module, "confirmed_bios", lambda name, urls, client, *rest: urls)
    class Append:
        def __init__(self, data):self.data=data
        def execute(self):
            memory.extend(self.data)
            return {"updates":{"updatedRows":len(self.data)}}
    class Sheets:
        def values(self):return self
        def append(self,**kw):
            assert kw["range"] == "'Connections'!A:L"
            assert kw["spreadsheetId"] == "test-sheet"
            seen.append(kw)
            return Append(kw["body"]["values"])
    contact.sheets=Sheets()
    result = contact.run(None,job,"Verified professional summary")
    assert result["status"]=="saved"
    assert result["count"]==1
    assert result["added"]==1
    assert result["research_calls"]==1
    assert len(seen)==1
    saved=memory[0]
    assert saved[0]=="BDO" and saved[1]=="Kevin Doyle"
    assert saved[5]=="Abhishek Nair" and saved[6]=="68"
    assert saved[7]==job.application_link
    assert saved[2]==""  # Direct LinkedIn URL is never invented
    assert saved[3].startswith("https://www.linkedin.com/search/results/people/")
    assert "https://www.bdo.ie/" in saved[9]
    assert saved[10].startswith("Hi Kevin,\n\n")
    assert "\n\nThank you" in saved[10]


def test_manual_run_snapshot_preserves_web_opt_in_when_checkbox_changes():
    from automate_cv.controlled import resolve_web_search
    assert resolve_web_search(False, 'true') is True
    assert resolve_web_search(True, 'true') is True
    assert resolve_web_search(True, 'false') is False
    assert resolve_web_search(True, '') is True
    assert resolve_web_search(False, '') is False
    import pytest
    with pytest.raises(ValueError):
        resolve_web_search(True, 'untrusted')


def test_manual_dispatch_workflow_accepts_web_snapshot_input():
    from pathlib import Path
    root = Path(__file__).resolve().parents[1]
    workflow = (root / '.github/workflows/controlled-cv-test.yml').read_text()
    assert 'web_search:' in workflow
    assert 'MANUAL_WEB_SEARCH:' in workflow
    assert '--web-search "$MANUAL_WEB_SEARCH"' in workflow
