from google import genai
from google.genai import types
import hashlib
import json
import os
import re
import time
from dotenv import load_dotenv

load_dotenv()

MODEL = os.getenv("GEMINI_MODEL", "gemini-flash-latest")
CACHE_TTL = 600  # 10 minutes

_client = None
_cache = {}


def _get_client():
    global _client
    if _client is None:
        key = os.getenv("GEMINI_API_KEY")
        if not key:
            raise RuntimeError("GEMINI_API_KEY is not set in backend/.env")
        _client = genai.Client(api_key=key)
    return _client


def _parse_json(raw: str):
    raw = raw.strip()
    raw = re.sub(r"^```json\s*", "", raw)
    raw = re.sub(r"^```\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    return json.loads(raw.strip())


def call_llm_json(system: str, prompt: str, required_keys=(), temperature: float = 0.7):
    """Call Gemini in JSON mode, validate keys, retry once, cache for 10 minutes.

    Returns {"success": True, "data": {...}} or {"success": False, "error": "..."}.
    """
    cache_key = hashlib.sha256(f"{MODEL}|{system}|{prompt}|{temperature}".encode()).hexdigest()
    hit = _cache.get(cache_key)
    if hit and time.time() - hit[0] < CACHE_TTL:
        return hit[1]

    last_error = "unknown error"
    for _ in range(2):
        try:
            response = _get_client().models.generate_content(
                model=MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=system,
                    response_mime_type="application/json",
                    temperature=temperature,
                ),
            )
            data = _parse_json(response.text or "")
            missing = [k for k in required_keys if k not in data]
            if missing:
                raise ValueError(f"Missing required fields: {', '.join(missing)}")
            result = {"success": True, "data": data}
            _cache[cache_key] = (time.time(), result)
            return result
        except json.JSONDecodeError as e:
            last_error = f"AI returned invalid format. Please try again. ({e})"
        except Exception as e:
            last_error = f"Generation failed: {e}"
    return {"success": False, "error": last_error}


def build_prompt(text: str, difficulty: str, num_questions: int) -> str:
    return f"""Analyze the text below and return ONLY a valid JSON object.

The JSON must follow this exact structure:
{{
  "summary": [
    {{"topic": "Topic Name", "points": ["key point 1", "key point 2", "key point 3"]}}
  ],
  "quiz": [
    {{
      "question": "Clear question text?",
      "options": ["A. First option", "B. Second option", "C. Third option", "D. Fourth option"],
      "correct": "A",
      "explanation": "Brief explanation of why this is correct"
    }}
  ],
  "key_terms": [
    {{"term": "Term", "definition": "Clear and concise definition"}}
  ]
}}

Rules:
- summary: Group into logical topics (3-6 topics). Each topic must have 2-5 bullet points.
- quiz: Generate exactly {num_questions} questions at {difficulty} difficulty level.
  - Easy: factual recall questions
  - Medium: comprehension and application questions
  - Hard: analysis and inference questions
- key_terms: Extract 5-10 important terms with definitions.
- correct field must be just the letter: "A", "B", "C", or "D"

Text to analyze:
{text[:8000]}
"""


async def generate_study_content(text: str, difficulty: str, num_questions: int):
    return call_llm_json(
        "You are an expert study assistant. Always respond with valid JSON only.",
        build_prompt(text, difficulty, num_questions),
        required_keys=("summary", "quiz", "key_terms"),
    )
