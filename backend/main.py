from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn
from gemini import generate_study_content, LLMError
from pdf_extract import extract_text_from_pdf
import io
import db
from routers import documents, tutor, quiz, missions, dashboard, demo, voice_ws

app = FastAPI(title="StudyAI API")
db.init_db()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(LLMError)
async def llm_error_handler(request, exc):
    """Gemini is the only model: when it fails the client gets a clear 502, never canned content."""
    return JSONResponse(status_code=502, content={"error": f"Gemini request failed: {exc}"})


for _r in (documents, tutor, quiz, missions, dashboard, demo, voice_ws):
    app.include_router(_r.router)


@app.get("/")
def root():
    return {"status": "StudyAI API is running"}

@app.post("/api/generate")
async def generate(
    text: str = Form(None),
    difficulty: str = Form("Medium"),
    num_questions: int = Form(5),
    file: UploadFile = File(None)
):
    input_text = ""

    if file:
        contents = await file.read()
        if file.filename.endswith(".pdf"):
            input_text = extract_text_from_pdf(contents)
        elif file.filename.endswith(".txt"):
            input_text = contents.decode("utf-8")
        else:
            return JSONResponse(status_code=400, content={"error": "Only PDF and TXT files supported."})
    elif text:
        input_text = text
    else:
        return JSONResponse(status_code=400, content={"error": "Please provide text or upload a file."})

    if len(input_text.strip()) < 50:
        return JSONResponse(status_code=400, content={"error": "Text too short. Please provide more content."})

    result = await generate_study_content(input_text, difficulty, num_questions)
    return result

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=5000, reload=True)