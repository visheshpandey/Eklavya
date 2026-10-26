"""Whiteboard: board cleaning rules and the show_board tool event."""
import asyncio

import pytest

from app.ai import tools
from app.ai.live import build_system_prompt
from app.domain.board import MAX_ITEMS, MAX_ROWS, clean_board


def test_formula_board_keeps_formula_where_lines_and_result():
    card = clean_board({"kind": "Formula", "title": " Precision ", "formula": "Precision = TP / (TP + FP)",
                        "items": ["TP = spam caught", "  ", "FP = good mail flagged"], "result": "8 / (8 + 2) = 0.8"})
    assert card == {"kind": "formula", "title": "Precision", "formula": "Precision = TP / (TP + FP)",
                    "items": ["TP = spam caught", "FP = good mail flagged"], "result": "8 / (8 + 2) = 0.8"}


def test_steps_board_caps_items_and_drops_an_out_of_range_highlight():
    card = clean_board({"kind": "steps", "title": "Recall", "items": [f"step {i}" for i in range(20)], "highlight": 99})
    assert len(card["items"]) == MAX_ITEMS and card["highlight"] == 0
    assert clean_board({"kind": "steps", "title": "R", "items": ["a", "b"], "highlight": "2"})["highlight"] == 2


def test_table_rows_split_on_pipes_and_pad_or_trim_to_the_headers():
    card = clean_board({"kind": "table", "title": "Precision vs recall", "headers": ["", "Precision", "Recall"],
                        "rows": ["Asks | Of flagged, how many right? | Of real, how many caught?",
                                 "Hurt by | false alarms", "| | ", "a|b|c|d|e"] + ["x|y|z"] * 20})
    assert card["rows"][0] == ["Asks", "Of flagged, how many right?", "Of real, how many caught?"]
    assert card["rows"][1] == ["Hurt by", "false alarms", ""]
    assert card["rows"][2] == ["a", "b", "c"]                       # the empty row was dropped
    assert len(card["rows"]) <= MAX_ROWS


def test_long_text_is_cut_with_an_ellipsis():
    card = clean_board({"kind": "formula", "title": "T" * 200, "formula": "x" * 500})
    assert len(card["title"]) == 80 and card["title"].endswith("…") and len(card["formula"]) == 160


@pytest.mark.parametrize("args, message", [
    ({"kind": "chart", "title": "x"}, "kind must be"),
    ({"kind": "steps", "title": ""}, "title is required"),
    ({"kind": "formula", "title": "x"}, "needs formula"),
    ({"kind": "steps", "title": "x", "items": []}, "needs items"),
    ({"kind": "table", "title": "x", "headers": ["a"], "rows": []}, "needs rows"),
])
def test_bad_boards_explain_what_is_missing(args, message):
    with pytest.raises(ValueError, match=message):
        clean_board(args)


def run_tool(name, args):
    sent = []

    async def emit(event):
        sent.append(event)

    ctx = tools.ToolContext(user_id=1, document_id=None, emit=emit)
    return asyncio.run(tools.dispatch(ctx, name, args)), sent


def test_show_board_tool_sends_a_board_event_to_the_browser():
    result, sent = run_tool("show_board", {"kind": "steps", "title": "F1", "items": ["Find P", "Find R", "Harmonic mean"], "highlight": 1})
    assert result == {"shown": True}
    assert sent == [{"type": "board", "kind": "steps", "title": "F1", "items": ["Find P", "Find R", "Harmonic mean"], "highlight": 1}]


def test_a_bad_board_is_reported_to_the_model_and_nothing_is_shown():
    result, sent = run_tool("show_board", {"kind": "steps", "title": "F1"})
    assert result["shown"] is False and "needs items" in result["error"] and sent == []


def test_the_tutor_is_told_about_the_whiteboard_and_the_tool_is_declared():
    assert "show_board" in [d.name for d in tools.TOOL_DECLARATIONS]
    assert "# The whiteboard" in build_system_prompt("english", [{"topic_name": "Precision"}])
