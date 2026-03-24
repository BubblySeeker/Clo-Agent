"""
Document processing and search endpoints.
Called by Go backend via internal proxy.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.database import run_query
from app.routes import verify_secret

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai")


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


class ExtractPropertyRequest(BaseModel):
    document_id: str
    agent_id: str


@router.post("/documents/extract-property", dependencies=[Depends(verify_secret)])
async def extract_property_fields(req: ExtractPropertyRequest):
    """Extract real estate property fields from a processed document using AI."""
    import json as json_mod
    import anthropic
    from app.config import ANTHROPIC_API_KEY

    try:
        # Fetch first 15 chunks to get enough context
        chunks = await run_query(
            lambda: _fetch_chunks_for_extraction(req.document_id, req.agent_id)
        )
        if not chunks:
            raise HTTPException(status_code=404, detail="No chunks found for document")

        combined_text = "\n\n".join(c["content"] for c in chunks)
        # Limit to ~12000 chars
        if len(combined_text) > 12000:
            combined_text = combined_text[:12000]

        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            messages=[{
                "role": "user",
                "content": f"""Extract real estate property information from this document text. Return ONLY valid JSON with these fields (use null for fields not found):

{{
  "address": "street address",
  "city": "city name",
  "state": "2-letter state code",
  "zip": "zip code",
  "price": number or null,
  "bedrooms": number or null,
  "bathrooms": number or null,
  "sqft": number or null,
  "property_type": "residential" | "commercial" | "land" | "multi_family" | "condo" | null,
  "listing_type": "sale" | "lease" | null,
  "mls_id": "MLS number or null",
  "description": "brief 1-2 sentence description",
  "year_built": number or null,
  "lot_size": "lot size string or null"
}}

Document text:
{combined_text}"""
            }],
        )

        # Parse the AI response as JSON
        ai_text = response.content[0].text.strip()
        # Handle markdown code blocks
        if ai_text.startswith("```"):
            ai_text = ai_text.split("\n", 1)[1]
            if ai_text.endswith("```"):
                ai_text = ai_text[:-3].strip()

        extracted = json_mod.loads(ai_text)
        return extracted

    except HTTPException:
        raise
    except json_mod.JSONDecodeError:
        logger.error("AI returned invalid JSON for property extraction")
        raise HTTPException(status_code=500, detail="Failed to parse extraction result")
    except Exception as e:
        logger.exception("Property extraction failed for doc %s", req.document_id)
        raise HTTPException(status_code=500, detail=str(e))


def _fetch_chunks_for_extraction(document_id: str, agent_id: str):
    """Fetch first N chunks of a document for property extraction."""
    from app.database import get_connection

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SET LOCAL app.current_agent_id = %s", (agent_id,))
            cur.execute(
                """SELECT content FROM document_chunks
                   WHERE document_id = %s
                   ORDER BY chunk_index ASC LIMIT 15""",
                (document_id,),
            )
            rows = cur.fetchall()
            conn.commit()
            return [{"content": r[0]} for r in rows]
    except Exception:
        conn.rollback()
        raise
    finally:
        from app.database import release_connection
        release_connection(conn)


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
