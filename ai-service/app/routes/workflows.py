"""
Workflow API routes for the AI service.
Called by the Go backend when events happen through direct API calls
(bypassing the AI agent).
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.database import run_query
from app.services.workflow_engine import trigger_workflows
from app.routes import verify_secret

router = APIRouter(prefix="/ai")


class TriggerRequest(BaseModel):
    trigger_type: str
    agent_id: str
    trigger_data: dict | None = None


@router.post("/workflows/trigger", dependencies=[Depends(verify_secret)])
async def trigger_workflow_endpoint(body: TriggerRequest):

    run_ids = await run_query(
        lambda: trigger_workflows(body.trigger_type, body.agent_id, body.trigger_data)
    )
    return {"triggered": len(run_ids), "run_ids": run_ids}
