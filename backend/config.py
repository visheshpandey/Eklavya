"""Central settings: env vars, DB path, mastery constants."""
import os
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-flash-latest")
DB_PATH = os.getenv("DB_PATH", os.path.join(os.path.dirname(__file__), "data", "studypilot.db"))
DEMO_USER_ID = 1  # single seeded student, no login

# Mastery rule (PRD s9): correct +15*(1-m/100), wrong -10*confidence, clamp 0-100
CORRECT_GAIN = 15
WRONG_PENALTY = 10
RETRIEVAL_TOP_K = 4
