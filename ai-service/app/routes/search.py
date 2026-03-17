"""Semantic search endpoint."""
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from app.config import AI_SERVICE_SECRET
from app.database import run_query
from app.services.embeddings import semantic_search

router = APIRouter()


class SearchRequest(BaseModel):
    query: str
    agent_id: str
    limit: int = 10


@router.post("/ai/search")
async def search(body: SearchRequest, x_ai_service_secret: str = Header(...)):
    if x_ai_service_secret != AI_SERVICE_SECRET:
        raise HTTPException(status_code=403, detail="Unauthorized")

    results = await run_query(
        lambda: semantic_search(body.query, body.agent_id, body.limit)
    )
    return {"results": results}
