"""Central settings: env vars, DB path, mastery constants."""
import os
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")
DB_PATH = os.getenv("DB_PATH", os.path.join(os.path.dirname(__file__), "data", "studypilot.db"))
DEMO_USER_ID = 1  # single seeded student, no login

# Mastery rule (PRD s9): correct +15*(1-m/100), wrong -10*confidence, clamp 0-100
CORRECT_GAIN = 15
WRONG_PENALTY = 10
RETRIEVAL_TOP_K = 4

# --- Gemini Live (voice tutor). Model IDs are env-configurable because they change; verify with
# scripts/check_gemini.py before relying on them.
GEMINI_LIVE_MODEL = os.getenv("GEMINI_LIVE_MODEL", "gemini-3.8-live")
LIVE_VOICE = os.getenv("LIVE_VOICE", "Kore")
# Not supported on every Live model (docs: not on 3.1 Flash Live). Emotion is also captured via report_learner_state.
LIVE_AFFECTIVE_DIALOG = os.getenv("LIVE_AFFECTIVE_DIALOG", "false").lower() == "true"
SESSION_CAP_SECONDS = int(os.getenv("SESSION_CAP_SECONDS", "840"))  # Live audio sessions are limited to 15 min
INPUT_AUDIO_MIME = "audio/pcm;rate=16000"   # browser -> Gemini
OUTPUT_SAMPLE_RATE = 24000                  # Gemini -> browser
