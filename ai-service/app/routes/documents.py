"""
Document processing and search endpoints.
Called by Go backend via internal proxy.
"""
import logging
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from app.config import AI_SERVICE_SECRET
from app.database import run_query

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai")


def verify_secret(x_ai_service_secret: str = Header(...)):
    if x_ai_service_secret != AI_SERVICE_SECRET:
        raise HTTPException(status_code=403, detail="Unauthorized")


class ProcessDocumentRequest(BaseModel):
    document_id: str
    agent_id: str


class DocumentSearchRequest(BaseModel):
    query: str
    agent_id: str
    k: int | None = None
    document_id: str | None = None
    contact_id: str | None = None


@router.post("/documents/process", dependencies=[Depends(verify_secret)])
async def process_document(req: ProcessDocumentRequest):
    """Process an uploaded document: extract text, chunk, generate embeddings."""
    from app.services.document_processor import process_document as do_process

    try:
        result = await run_query(lambda: do_process(req.document_id, req.agent_id))
        return result
    except Exception as e:
        logger.exception("Document processing failed for %s", req.document_id)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/documents/search", dependencies=[Depends(verify_secret)])
async def search_documents(req: DocumentSearchRequest):
    """Hybrid semantic + keyword search across document chunks."""
    from app.services.document_search import hybrid_search

    try:
        results = await run_query(
            lambda: hybrid_search(
                req.query, req.agent_id, req.k, req.document_id, req.contact_id
            )
        )
        return {"results": results}
    except Exception as e:
        logger.exception("Document search failed")
        raise HTTPException(status_code=500, detail=str(e))
