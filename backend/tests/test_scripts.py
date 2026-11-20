"""A Bengali, Tamil or Urdu word inside a Hinglish line never reaches the student."""
import conftest  # noqa: F401
from app.domain import language_check
from app.ai import prompts


def test_other_scripts_are_removed_but_latin_devanagari_digits_and_symbols_stay():
    text = "Magar woh \u09a0\u09bf\u0995 tha? \u0ba4\u0bae\u0bbf\u0bb4\u0bcd x\u00b2 \u2192 75% \u03b1 \u0905\u091a\u094d\u091b\u093e \u0633\u0644\u0627\u0645 ok."
    out = language_check.strip_foreign_scripts(text)
    for ch in "\u09a0\u09bf\u0995\u0ba4\u0bae\u0bbf\u0bb4\u0bcd\u0633\u0644\u0627\u0645":
        assert ch not in out
    assert "Magar woh" in out and "x\u00b2 \u2192 75%" in out and "\u03b1" in out and "\u0905\u091a\u094d\u091b\u093e" in out and out.endswith("ok.")
    assert language_check.strip_foreign_scripts("Plain English, 3 + 4 = 7.") == "Plain English, 3 + 4 = 7."


def test_it_counts_as_a_violation_and_clean_removes_it():
    line = "Sahi hai, magar woh \u09a0\u09bf\u0995 tha?"
    assert language_check.violations(line, "hinglish")
    assert "\u09a0" not in language_check.clean(line, "hinglish")


def test_the_prompt_tells_the_tutor_to_use_one_script():
    rules = prompts.load("language_rules.md")
    assert "ONLY the Roman (English) alphabet" in rules and "Bengali" in rules and "Devanagari only" in rules


def test_tool_call_markup_never_reaches_the_chat():
    leaked = "Chaliye, shuru karte hain. <function_calls> <tool_code> ask_quiz_question() </tool_code> </function_calls> Pehla sawaal."
    out = language_check.strip_markup(leaked)
    assert "<" not in out and "function_calls" not in out and "ask_quiz_question" not in out
    assert out.startswith("Chaliye, shuru karte hain.") and out.endswith("Pehla sawaal.")
    assert language_check.strip_markup("Sahi hai. <function_calls> <tool") == "Sahi hai."            # cut off mid-tag
    assert language_check.strip_markup("Compare a < b and c > d") == "Compare a < b and c > d"       # maths is left alone
