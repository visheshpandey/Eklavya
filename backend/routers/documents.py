"""POST /api/upload-document"""
from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import JSONResponse

from agents.document_intelligence import ingest_document
from pdf_extract import extract_text_from_pdf

router = APIRouter()


@router.post("/api/upload-document")
async def upload_document(user_id: int = Form(1), file: UploadFile = File(None), text: str = Form(None)):
    if file:
        raw = await file.read()
        name = file.filename or "notes"
        if name.lower().endswith(".pdf"):
            content = extract_text_from_pdf(raw)
        elif name.lower().endswith(".txt"):
            content = raw.decode("utf-8", errors="ignore")
        else:
            return JSONResponse(status_code=400, content={"error": "Only PDF and TXT files are supported."})
    elif text:
        name, content = "pasted-notes.txt", text
    else:
        return JSONResponse(status_code=400, content={"error": "Upload a file or paste text."})
    if len(content.strip()) < 50:
        return JSONResponse(status_code=400, content={"error": "Could not read enough text. Scanned PDFs are not supported yet."})
    return ingest_document(user_id, name, content)
