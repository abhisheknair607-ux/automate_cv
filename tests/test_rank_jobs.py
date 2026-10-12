"""No-network checks for opt-in candidate ranking and safe score calculations."""
import json
import pytest

from automate_cv.rank_jobs import CANDIDATES, parse_scores


def test_rounded_weighted_priority_score():
    response = json.dumps({
        "jobs": [{"row": 3, "profile_fit": 80, "career_alignment": 90},
                 {"row": 5, "profile_fit": 91, "career_alignment": 71}]
    })
    assert parse_scores(response, {3, 5}) == {3: 85, 5: 82}


def test_bad_or_partial_scores_fail_closed():
    with pytest.raises(ValueError):
        parse_scores('{"jobs":[{"row":3,"profile_fit":99,"career_alignment":99}]}', {3, 4})
    with pytest.raises(ValueError):
        parse_scores('{"jobs":[{"row":3,"profile_fit":101,"career_alignment":10}]}', {3})
    with pytest.raises(ValueError):
        parse_scores('{"jobs":[{"row":3,"profile_fit":88,"career_alignment":80},'
                     '{"row":3,"profile_fit":70,"career_alignment":70}]}', {3})


def test_candidates_have_isolated_score_and_selection_columns():
    assert CANDIDATES["abhishek"]["score_col"] == "AL"
    assert CANDIDATES["pooja"]["score_col"] == "AN"
    assert CANDIDATES["abhishek"]["selected_index"] != CANDIDATES["pooja"]["selected_index"]
