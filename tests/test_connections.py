from types import SimpleNamespace

from automate_cv.connections import canonical_url, matching_rows, parse_contacts


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
