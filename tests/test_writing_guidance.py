import pytest

from automate_cv.writing_guidance import profile_voice, cover_letter_voice


@pytest.mark.parametrize('candidate,own,other', [
    ('abhishek', 'For Abhishek', 'For Pooja'),
    ('pooja', 'For Pooja', 'For Abhishek'),
])
def test_candidate_voice_is_isolated_and_source_bound(candidate, own, other):
    profile = profile_voice(candidate)
    letter = cover_letter_voice(candidate)
    assert own in profile and own in letter
    assert other not in profile and other not in letter
    assert 'verified' in profile.lower()
    assert 'verified' in letter.lower()
    assert 'Mumbai origins or a humble-background story' in letter
    assert 'ONLY if independently verified' in letter
    assert 'Never transfer one' in letter


def test_cover_letter_guidance_keeps_company_brand_and_ats_safe():
    letter = cover_letter_voice('abhishek')
    assert 'official company website' in letter
    assert 'Do not guess a brand colour' in letter
    assert 'WEB_SEARCH permits research' in letter
    assert 'single-column reading' in letter
    assert 'selectable text' in letter
    assert 'thin divider' in letter
    assert 'Render the finished DOCX' in letter


def test_unknown_candidate_fails_closed():
    with pytest.raises(KeyError):
        profile_voice('someone_else')
    with pytest.raises(KeyError):
        cover_letter_voice('someone_else')
