from types import SimpleNamespace

from automate_cv.connections import canonical_url, matching_rows, parse_contacts, linkedin_invitation


def example(candidate="Abhishek Nair", row=68):
    return SimpleNamespace(
        company="BDO",
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
