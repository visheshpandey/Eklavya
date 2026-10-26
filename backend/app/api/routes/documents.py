"""POST /api/upload-document: read a PDF/TXT, a photo of notes (Gemini reads it), or pasted text; chunk it, extract topics."""
from fastapi import APIRouter, File, Form, UploadFile
from fastapi.concurrency import run_in_threadpool

from app.agents.document_intelligence import ingest_document
from app.ai.gemini import IMAGE_TYPES, read_image
from app.config import settings
from app.domain.pdf import extract_text
from app.errors import BadRequestError, PayloadTooLargeError
from app.services.documents import delete_document

router = APIRouter()
MIN_TEXT_CHARS = 50


@router.post("/api/upload-document")
async def upload_document(user_id: int = Form(settings.demo_user_id), file: UploadFile = File(None), text: str = Form(None)):
    if file is not None:
        raw = await file.read()
        if len(raw) > settings.max_upload_mb * 1024 * 1024:
            raise PayloadTooLargeError(f"File is larger than {settings.max_upload_mb} MB.")
        name = file.filename or "notes"
        image_type = IMAGE_TYPES.get(name.rsplit(".", 1)[-1].lower()) if "." in name else None
        if image_type:   # a photographed page: Gemini writes out its text
            content = await run_in_threadpool(read_image, raw, image_type)
            if len(content.strip()) < MIN_TEXT_CHARS:
                raise BadRequestError("Could not read study notes in this photo. Try a sharper, well-lit photo of the page.")
        else:
            content = await run_in_threadpool(extract_text, name, raw)   # PDF parsing is CPU-bound
    elif text:
        name, content = "pasted-notes.txt", text
    else:
        raise BadRequestError("Upload a file or paste some text.")
    if len(content.strip()) < MIN_TEXT_CHARS:
        raise BadRequestError("Could not read enough text from this. Scanned PDFs are not supported yet.")
    # ingest calls Gemini (blocking): keep it off the event loop that also serves the voice WebSocket
    return await run_in_threadpool(ingest_document, user_id, name, content)


@router.delete("/api/documents/{document_id}")
def remove_document(document_id: int, user_id: int = settings.demo_user_id):
    delete_document(user_id, document_id)
    return {"deleted": document_id}
