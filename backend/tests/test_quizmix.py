"""Mixing answer options: the right answer and every misconception follow their option to the new letter."""
import random

import conftest  # noqa: F401  (isolated DB before the app is imported)
import pytest

from app.domain.quizmix import can_mix, mix_question

OPTIONS = ["A. TP / (TP + FN)", "B. TP / (TP + FP)", "C. TP / (TP + TN)", "D. (TP + TN) / all"]
MISCON = {"A": {"label": "formula_inversion", "text": "uses recall"}, "D": {"label": "definition_mixup", "text": "uses accuracy"}}


def text_of(option):
    return option.split(". ", 1)[1]


@pytest.mark.parametrize("seed", range(40))
def test_the_right_answer_and_misconceptions_follow_their_option(seed):
    options, correct, miscon = mix_question(OPTIONS, "B", MISCON, random.Random(seed))
    by_letter = {o[0]: text_of(o) for o in options}
    assert sorted(by_letter) == ["A", "B", "C", "D"] and sorted(by_letter.values()) == sorted(text_of(o) for o in OPTIONS)
    assert by_letter[correct] == "TP / (TP + FP)"                                   # the right option is still the right one
    assert {by_letter[k]: v["text"] for k, v in miscon.items()} == {"TP / (TP + FN)": "uses recall", "(TP + TN) / all": "uses accuracy"}


def test_the_right_answer_does_not_always_land_on_the_same_letter():
    letters = {mix_question(OPTIONS, "B", MISCON, random.Random(seed))[1] for seed in range(60)}
    assert letters == {"A", "B", "C", "D"}


def test_options_that_refer_to_each_other_are_left_alone():
    options = ["A. Only the first", "B. Only the second", "C. Both A and B", "D. None of the above"]
    assert not can_mix(options)
    assert mix_question(options, "C", {"A": {"text": "x"}}, random.Random(1)) == (options, "C", {"A": {"text": "x"}})


def test_odd_option_counts_are_left_alone():
    assert mix_question(["A. yes", "B. no"], "A", None, random.Random(1)) == (["A. yes", "B. no"], "A", {})
