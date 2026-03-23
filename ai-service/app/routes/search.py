"""Semantic search endpoint."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.database import run_query
from app.services.embeddings import semantic_search
from app.routes import verify_secret

router = APIRouter()


class SearchRequest(BaseModel):
    query: str
    agent_id: str
    limit: int = 10


@router.post("/ai/search", dependencies=[Depends(verify_secret)])
async def search(body: SearchRequest):
    results = await run_query(
        lambda: semantic_search(body.query, body.agent_id, body.limit)
    )
    return {"results": results}
