"""What one student costs per month, computed from the models the app is actually configured to use (pure, no I/O).

Every number is either read from the settings (the model names, the voice) or is a stated ASSUMPTION below, and the formula is returned with the
result so it can be shown and checked. Prices change: the PRICE_* values are placeholders to verify against the vendor's price list for the
configured model (https://ai.google.dev/pricing) before they are quoted anywhere official. Nothing here is a measured pilot figure.
"""
# ---- usage profile (assumptions: change them to match a real pilot)
STUDY_DAYS_PER_MONTH = 20
VOICE_MINUTES_PER_STUDY_DAY = 10          # minutes of live voice a student talks with the tutor on a study day
TUTOR_SPEAKING_SHARE = 0.5                # share of a voice session in which Eklavya is the one speaking
ASK_QUESTIONS_PER_STUDY_DAY = 5
NOTES_UPLOADS_PER_MONTH = 2
FLASHCARD_DECKS_PER_MONTH = 6
AUDIO_TOKENS_PER_SECOND = 32              # Gemini counts audio at about 32 tokens per second (check the current docs)
ASK_TOKENS = (1500, 300)                  # (input, output) tokens per Ask question: the question plus the retrieved passages, and the answer
UPLOAD_TOKENS = (14000, 400)              # topic extraction over a notes document
UPLOAD_EMBED_TOKENS = 10000               # note search embeddings per document
DECK_TOKENS = (2500, 700)                 # writing flashcards from one topic's notes

# ---- prices in US dollars per million tokens (PLACEHOLDERS to verify, see the module docstring)
PRICE_TEXT_IN, PRICE_TEXT_OUT = 0.10, 0.40
PRICE_AUDIO_IN, PRICE_AUDIO_OUT = 3.00, 12.00
PRICE_EMBED_IN = 0.15
INR_PER_USD = 85                          # assumption for the rupee figure


def _usd(tokens: float, per_million: float) -> float:
    return tokens * per_million / 1_000_000


def monthly_cost(text_model: str, live_model: str, embed_model: str, voice: str) -> dict:
    """The monthly cost of one student, as lines with their formulas plus the total."""
    voice_seconds = STUDY_DAYS_PER_MONTH * VOICE_MINUTES_PER_STUDY_DAY * 60
    audio_in = voice_seconds * AUDIO_TOKENS_PER_SECOND                                    # the student's microphone is streamed for the whole session
    audio_out = voice_seconds * TUTOR_SPEAKING_SHARE * AUDIO_TOKENS_PER_SECOND            # the tutor's voice
    asks = STUDY_DAYS_PER_MONTH * ASK_QUESTIONS_PER_STUDY_DAY
    lines = [
        {"label": f"Voice tutor ({live_model}, voice {voice}), listening",
         "formula": f"{STUDY_DAYS_PER_MONTH} days x {VOICE_MINUTES_PER_STUDY_DAY} min x 60 s x {AUDIO_TOKENS_PER_SECOND} tokens/s = {audio_in:,.0f} tokens x ${PRICE_AUDIO_IN}/1M",
         "usd": _usd(audio_in, PRICE_AUDIO_IN)},
        {"label": "Voice tutor, speaking (Eklavya's voice comes from the same model: no separate text to speech)",
         "formula": f"{audio_in:,.0f} tokens x {TUTOR_SPEAKING_SHARE} speaking share = {audio_out:,.0f} tokens x ${PRICE_AUDIO_OUT}/1M",
         "usd": _usd(audio_out, PRICE_AUDIO_OUT)},
        {"label": f"Ask and the text agents ({text_model})",
         "formula": f"{asks} questions x ({ASK_TOKENS[0]} in x ${PRICE_TEXT_IN}/1M + {ASK_TOKENS[1]} out x ${PRICE_TEXT_OUT}/1M)",
         "usd": asks * (_usd(ASK_TOKENS[0], PRICE_TEXT_IN) + _usd(ASK_TOKENS[1], PRICE_TEXT_OUT))},
        {"label": f"Reading new notes ({text_model} for topics, {embed_model} for search)",
         "formula": f"{NOTES_UPLOADS_PER_MONTH} documents x (topics {UPLOAD_TOKENS[0]} in / {UPLOAD_TOKENS[1]} out + {UPLOAD_EMBED_TOKENS} embedding tokens)",
         "usd": NOTES_UPLOADS_PER_MONTH * (_usd(UPLOAD_TOKENS[0], PRICE_TEXT_IN) + _usd(UPLOAD_TOKENS[1], PRICE_TEXT_OUT) + _usd(UPLOAD_EMBED_TOKENS, PRICE_EMBED_IN))},
        {"label": "Flashcard decks",
         "formula": f"{FLASHCARD_DECKS_PER_MONTH} decks x ({DECK_TOKENS[0]} in x ${PRICE_TEXT_IN}/1M + {DECK_TOKENS[1]} out x ${PRICE_TEXT_OUT}/1M)",
         "usd": FLASHCARD_DECKS_PER_MONTH * (_usd(DECK_TOKENS[0], PRICE_TEXT_IN) + _usd(DECK_TOKENS[1], PRICE_TEXT_OUT))},
    ]
    total = sum(line["usd"] for line in lines)
    return {
        "models": {"text": text_model, "live": live_model, "embedding": embed_model, "voice": voice},
        "lines": [{**line, "usd": round(line["usd"], 4)} for line in lines],
        "total_usd": round(total, 2), "total_inr": round(total * INR_PER_USD),
        "inr_per_usd": INR_PER_USD,
        "voice_is_the_bulk": lines[0]["usd"] + lines[1]["usd"] > 0.5 * total,
        "verify": "Prices and token rates above are assumptions to verify against the vendor's price list for the configured models; usage is an assumed profile, not a pilot measurement.",
    }
