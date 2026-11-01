"""The tutor must not slip into other languages, Devanagari inside Hinglish, or "bhai": prompts, the check and the Ask retry."""
import conftest  # noqa: F401  (isolated DB before the app is imported)
import pytest

from app import accounts, db
from app.agents import voice_tutor
from app.ai import live
from app.config import settings
from app.domain import language_check as lc
from main import app  # noqa: F401  (creates the schema when this file runs on its own)


def test_the_check_finds_each_kind_of_slip():
    assert lc.violations("Dekh bhai, precision matlab ye hai", "hinglish")
    assert lc.violations("Bu a\u015f\u0131r\u0131 de\u011fil, aslında recall hai", "hinglish")        # Turkish letters and "aslında"
    assert lc.violations("Yeh sahi \u0939\u0948 \u092f\u093e nahi?", "hinglish")                      # Devanagari inside a Roman-script line
    assert lc.violations("Tum batao kya hota hai?", "hinglish")
    assert lc.violations("\u041f\u0440\u0438\u0432\u0435\u0442", "hindi")                              # Cyrillic
    assert lc.violations("Aap dekhiye, precision ka matlab hai: flagged items mein se sahi kitne.", "hinglish") == []
    assert lc.violations("\u092f\u0939 \u0938\u0939\u0940 \u0939\u0948", "hindi") == []                # Devanagari is right in Hindi mode
    assert lc.violations("Precision is the share of flagged emails that are really spam.", "english") == []


def test_clean_removes_pet_names_foreign_words_and_casual_commands():
    assert lc.clean("Dekh bhai, precision matlab ye hai", "hinglish") == "Dekhiye precision matlab ye hai"
    assert lc.clean("Yeh aslında sahi hai", "hinglish") == "Yeh sahi hai"
    assert "bhai" not in lc.clean("Sun yaar, F1 ek balance hai", "hinglish").lower()


def test_every_persona_carries_the_language_rules_and_the_senior_is_not_street_casual():
    for tutor in live.TUTORS:
        for lang in ("hinglish", "hindi", "english"):
            prompt = live.build_system_prompt(lang, [], tutor=tutor)
            assert "never \"bhai\"" in prompt and "gender-neutral" in prompt and live.LANGUAGE_RULES[lang] in prompt
    assert "never Devanagari" in live.build_system_prompt("hinglish", [])
    for mode, kwargs in (("viva", {}), ("debate", {"debate": {"side": "for", "motion": "", "style": "tough"}})):
        prompt = live.build_system_prompt("hinglish", [], mode, {"id": 1, "topic_name": "Recall"}, **kwargs)
        assert "Language rules" in prompt                                                              # examiner and debater too
    assert "casual" not in live.TUTORS["senior"]["style"].lower()


def test_ask_regenerates_once_when_the_answer_slips_and_cleans_what_is_left(monkeypatch):
    user = db.execute("INSERT INTO users (name, email) VALUES ('Lang', 'lang@example.com')")
    doc = db.execute("INSERT INTO documents (user_id, file_name) VALUES (?, 'n.txt')", (user,))
    topic = db.execute("INSERT INTO topics (document_id, topic_name) VALUES (?, 'Recall')", (doc,))
    db.execute("INSERT INTO chunks (document_id, topic_id, heading, text) VALUES (?, ?, 'Recall', 'Recall is TP over TP+FN.')", (doc, topic))
    monkeypatch.setattr(voice_tutor, "search", lambda *a, **k: [{"topic": "Recall", "heading": "h", "text": "t", "document_id": doc, "score": 1}])
    replies = [{"answer": "Dekh bhai, recall matlab ye hai", "follow_up_question": "Aslında kya hai?", "source_topic": "Recall"},
               {"answer": "Dekh bhai, recall matlab ye hai", "follow_up_question": "Samjhe?", "source_topic": "Recall"}]
    prompts_seen = []

    def fake(system, prompt, **kwargs):
        prompts_seen.append(prompt)
        return dict(replies.pop(0))
    monkeypatch.setattr(voice_tutor, "llm_json", fake)
    try:
        out = voice_tutor.ask(user, "recall?", "hinglish")
    finally:
        accounts.erase_user(user)
    assert len(prompts_seen) == 2 and "Write it again without them" in prompts_seen[1]
    assert "bhai" not in out["answer"].lower() and out["answer"].startswith("Dekhiye")             # whatever survives the retry is cleaned
    assert voice_tutor.SYSTEM.count("bhai") == 1 and "never use bhai" in voice_tutor.SYSTEM


def test_a_slip_in_a_live_turn_reminds_the_model_after_that_turn(monkeypatch):
    from types import SimpleNamespace as NS
    from app.ai import gemini
    from tests.test_live import FakeSession, client, collect, fake_connect, fake_text_gemini, sc
    monkeypatch.setattr(gemini, "call_llm_json", fake_text_gemini)   # no network: the seed's topic and question writing is faked
    client.post("/api/demo/seed")   # the demo student needs notes before a call can start
    fake = FakeSession([[sc(output_transcription=NS(text="Dekh bhai, ye aslında easy hai")), sc(turn_complete=True)]])
    monkeypatch.setattr(live, "default_connect", fake_connect(fake))
    with client.websocket_connect("/ws/voice") as ws:
        collect(ws)
    reminders = [s for s in fake.sent if "Style reminder" in str(s.get("text", ""))]
    assert reminders and "aap" in reminders[0]["text"]
