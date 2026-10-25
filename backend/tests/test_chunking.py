"""Turning real-world notes (a PDF syllabus with no blank lines) into searchable chunks and topics."""
import pytest

from app import db
from app.agents import document_intelligence as docs
from app.ai import gemini
from app.domain import retrieval
from app.domain.pdf import clean_text
from app.services.topics import topic_detail

@pytest.fixture(autouse=True)
def _database():
    db.init_db()                                       # this module may run without the API app being imported


UNIT_BODY = ("Types of grammar, context sensitive grammar, and context free grammar, regular grammar. Derivation trees, "
             "ambiguity in grammar, killing null and unit productions. Chomsky normal form and Greibach normal form. ")


def syllabus(units=5, repeat=3):
    """One long paragraph, like text pulled from a PDF: course header, then Unit-I ... Unit-N."""
    parts = ["RGPV Theory of Computation COURSE OBJECTIVE To understand computability and complexity."]
    titles = ["Introduction of Automata Theory", "Types of Finite Automata", "Grammars", "Push Down Automata", "Turing Machine"]
    for i in range(units):
        parts.append(f"Unit-{['I', 'II', 'III', 'IV', 'V'][i]} {titles[i]}: " + UNIT_BODY * repeat)
    return " ".join(parts)


def test_long_block_is_split_at_unit_markers_with_the_unit_title_as_heading():
    chunks = retrieval.chunk_text(syllabus())
    headings = [c["heading"] for c in chunks if c["heading"].startswith("Unit-")]
    assert headings[:5] == ["Unit-I Introduction of Automata Theory", "Unit-II Types of Finite Automata", "Unit-III Grammars",
                            "Unit-IV Push Down Automata", "Unit-V Turing Machine"]
    assert all(len(c["text"].split()) <= retrieval.MAX_CHUNK_WORDS for c in chunks)
    assert len(chunks) >= 6                                            # not one giant chunk any more


def test_the_word_unit_inside_a_sentence_is_not_a_marker():
    """Every unit body says "killing null and unit productions"; that must not create extra cuts."""
    headings = [c["heading"] for c in retrieval.chunk_text(syllabus()) if c["heading"]]
    assert [h for h in headings if not h.startswith(("Unit-", "COURSE"))] == []
    assert sum(h.startswith("Unit-") for h in headings) >= 5


def test_long_text_without_markers_or_punctuation_is_still_cut_into_small_chunks():
    chunks = retrieval.chunk_text("word " * 900)
    assert len(chunks) >= 4 and all(len(c["text"].split()) <= retrieval.MAX_CHUNK_WORDS for c in chunks)


def test_short_structured_notes_are_unchanged():
    chunks = retrieval.chunk_text("Precision\n\nPrecision is TP over TP plus FP.\n\nRecall\n\nRecall is TP over TP plus FN.")
    assert [(c["heading"], c["text"]) for c in chunks] == [("Precision", "Precision is TP over TP plus FP."),
                                                           ("Recall", "Recall is TP over TP plus FN.")]


def test_pdf_text_clean_up():
    raw = "COURSE OBJECTIVE  To analyse &amp; design Arden�s theorem  with   spaces"
    assert clean_text(raw) == "COURSE OBJECTIVE • To analyse & design Arden's theorem with spaces"


def test_topic_extraction_sees_the_whole_document_and_caps_the_topic_count(monkeypatch):
    seen = {}

    def fake(system, prompt, required_keys=(), temperature=0.7, **_):
        if "topic structure" in system:
            seen["prompt"] = prompt
            return {"success": True, "data": {"topics": [f"Topic {i}" for i in range(45)] + ["Topic 3"]}}
        return {"success": False, "error": "unexpected"}

    monkeypatch.setattr(gemini, "call_llm_json", fake)
    text = ("Early section. " * 700) + "LATE-MARKER-WORD " + ("filler text. " * 200)        # the marker sits far beyond 8,000 characters
    assert len(text) > 12000 and text.index("LATE-MARKER-WORD") > 8000
    result = docs.ingest_document(1, "long.txt", text)
    assert "LATE-MARKER-WORD" in seen["prompt"]
    assert len(result["topics_found"]) == docs.MAX_TOPICS == 30
    assert len({t["topic_name"] for t in result["topics_found"]}) == 30                  # duplicates removed


def test_chunks_go_to_the_topic_their_heading_names_not_to_one_sharing_generic_words():
    topics = [{"id": 1, "topic_name": "DBMS: Relational Data Models"}, {"id": 2, "topic_name": "TOC: Turing Machines"}]
    weights = docs._topic_tokens(topics)
    chunk = {"heading": "Unit-V Turing Machine", "text": "Techniques for construction of machines, data representation and models of computation."}
    assert docs._assign_topic(chunk, topics, weights) == 2
    chunk = {"heading": "Unit II Relational Data models", "text": "Domains, tuples, attributes and relations."}
    assert docs._assign_topic(chunk, topics, weights) == 1


def test_a_topic_without_its_own_chunk_shows_the_closest_passages_instead_of_nothing(monkeypatch):
    monkeypatch.setattr(gemini, "call_llm_json", lambda *a, **k: {"success": True, "data": {"topics": ["Quantum Tunnelling", "Unit-I Grammars"]}})
    doc = docs.ingest_document(1, "mixed.txt", "Unit-I Grammars\n\nTypes of grammar, context free grammar, derivation trees and ambiguity in grammar.")
    lonely = next(t for t in doc["topics_found"] if t["topic_name"] == "Quantum Tunnelling")
    assert not db.one("SELECT 1 AS x FROM chunks WHERE topic_id = ?", (lonely["id"],))
    detail = topic_detail(next(t["id"] for t in doc["topics_found"] if t["topic_name"] == "Unit-I Grammars"), 1)
    assert detail["notes_are_related"] is False and detail["notes"]
    detail = topic_detail(lonely["id"], 1)
    assert detail["notes_are_related"] is True                                          # flagged so the UI can say so


def test_a_weak_one_word_match_does_not_file_a_chunk_under_a_topic():
    """Reported: a C-programming passage appeared under "Formal Grammars and Hierarchy" only because it said "hierarchy"."""
    topics = [{"id": 1, "topic_name": "TOC: Formal Grammars and Hierarchy"}, {"id": 2, "topic_name": "C: Basics of Programming"}]
    weights = docs._topic_tokens(topics)
    c_chunk = {"heading": "Unit-I Basics of programming", "text": "Character set, constants, variables, hierarchy of operations."}
    assert docs._assign_topic(c_chunk, topics, weights) == 2                      # its heading names the C topic
    stray = {"heading": "Appendix", "text": "Notes on the hierarchy of operations in expressions."}
    assert docs._assign_topic(stray, topics, weights) is None                      # one shared word is not enough
    only_topic = [{"id": 9, "topic_name": "Notes"}]
    assert docs._assign_topic(stray, only_topic, docs._topic_tokens(only_topic)) == 9   # a single-topic document keeps everything


def test_reading_a_whole_document_uses_the_longer_gemini_limit(monkeypatch):
    seen = []

    def fake(system, prompt, required_keys=(), temperature=0.7, timeout_ms=None):
        seen.append(timeout_ms)
        return {"success": True, "data": {"topics": ["Automata"]}}

    monkeypatch.setattr(gemini, "call_llm_json", fake)
    docs._llm_topics("some notes")
    gemini.llm_json("system", "prompt")                       # an ordinary call keeps the default limit
    assert seen == [docs.settings.gemini_long_timeout_ms, None]
    assert docs.settings.gemini_long_timeout_ms > docs.settings.gemini_timeout_ms


def test_closest_passages_drop_a_weak_runner_up(monkeypatch):
    from app.services import topics as topics_service

    monkeypatch.setattr(topics_service.retrieval, "retrieve", lambda *a, **k: [
        {"heading": "Unit-V Big Data Tools", "text": "strong", "score": 6.0},
        {"heading": "CO5", "text": "weak", "score": 1.0},
    ])
    doc = db.execute("INSERT INTO documents (user_id, file_name) VALUES (1, 'related.txt')")
    topic = db.execute("INSERT INTO topics (document_id, topic_name) VALUES (?, 'Big Data Tools')", (doc,))
    notes = topic_detail(topic, 1)["notes"]
    assert [n["text"] for n in notes] == ["strong"]
