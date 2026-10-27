"""POST /api/upload-document: read a PDF/TXT (scanned PDFs are read by Gemini), a photo of notes, or pasted text; chunk it,
extract topics. POST /api/import-link: notes from a YouTube video or a web article."""
from fastapi import APIRouter, File, Form, UploadFile
from fastapi.concurrency import run_in_threadpool

from app import auth
from app.agents.document_intelligence import ingest_document
from app.ai.gemini import IMAGE_TYPES, read_image, read_pdf
from app.api.schemas import LinkRequest
from app.config import settings
from app.domain.pdf import extract_text
from app.errors import BadRequestError, PayloadTooLargeError
from app.services.documents import delete_document
from app.services.links import notes_from_link

router = APIRouter()
MIN_TEXT_CHARS = 50


@router.post("/api/upload-document")
async def upload_document(file: UploadFile = File(None), text: str = Form(None), user_id: int = auth.CurrentUser):
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
            if name.lower().endswith(".pdf") and len(content.strip()) < MIN_TEXT_CHARS:   # no text layer: scanned pages
                content = await run_in_threadpool(read_pdf, raw)
                if len(content.strip()) < MIN_TEXT_CHARS:
                    raise BadRequestError("Could not read study notes in this PDF. Try clearer scans, or photos of the pages.")
    elif text:
        name, content = "pasted-notes.txt", text
    else:
        raise BadRequestError("Upload a file or paste some text.")
    if len(content.strip()) < MIN_TEXT_CHARS:
        raise BadRequestError("Could not read enough text from this.")
    # ingest calls Gemini (blocking): keep it off the event loop that also serves the voice WebSocket
    return await run_in_threadpool(ingest_document, user_id, name, content)


@router.delete("/api/documents/{document_id}")
def remove_document(document_id: int, user_id: int = auth.CurrentUser):
    delete_document(user_id, document_id)
    return {"deleted": document_id}


@router.post("/api/import-link")
async def import_link(req: LinkRequest, user_id: int = auth.CurrentUser):
    name, content = await run_in_threadpool(notes_from_link, req.url)   # fetching and Gemini both block
    return await run_in_threadpool(ingest_document, user_id, name, content)
