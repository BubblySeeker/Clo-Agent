"""
Workflow API routes for the AI service.
Called by the Go backend when events happen through direct API calls
(bypassing the AI agent).
"""
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from app.config import AI_SERVICE_SECRET
from app.database import run_query
from app.services.workflow_engine import trigger_workflows

router = APIRouter(prefix="/ai")


class TriggerRequest(BaseModel):
    trigger_type: str
    agent_id: str
    trigger_data: dict | None = None


@router.post("/workflows/trigger")
async def trigger_workflow_endpoint(
    body: TriggerRequest,
    x_ai_service_secret: str = Header(None),
):
    if x_ai_service_secret != AI_SERVICE_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")

    run_ids = await run_query(
        lambda: trigger_workflows(body.trigger_type, body.agent_id, body.trigger_data)
    )
    return {"triggered": len(run_ids), "run_ids": run_ids}
