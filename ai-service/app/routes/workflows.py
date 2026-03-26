"""
Workflow API routes for the AI service.

Endpoints:
- POST /ai/workflows/trigger  — fire event-based triggers (from Go backend)
- POST /ai/workflows/execute   — execute a workflow via AI agent session
- POST /ai/workflows/dry-run   — preview what a workflow would do (no mutations)
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.services.workflow_executor import execute_workflow, trigger_workflows
from app.routes import verify_secret

router = APIRouter(prefix="/ai")


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class TriggerRequest(BaseModel):
    trigger_type: str
    agent_id: str
    trigger_data: dict | None = None


class ExecuteRequest(BaseModel):
    workflow_id: str
    agent_id: str
    instruction: str
    approval_mode: str = "review"
    trigger_data: dict | None = None
    workflow_name: str | None = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/workflows/trigger", dependencies=[Depends(verify_secret)])
async def trigger_workflow_endpoint(body: TriggerRequest):
    run_ids = await trigger_workflows(body.trigger_type, body.agent_id, body.trigger_data)
    return {"triggered": len(run_ids), "run_ids": run_ids}


@router.post("/workflows/execute", dependencies=[Depends(verify_secret)])
async def execute_workflow_endpoint(body: ExecuteRequest):
    """Execute a workflow via a focused AI agent session. Streams SSE events."""
    if not body.instruction or not body.instruction.strip():
        raise HTTPException(status_code=400, detail="Workflow instruction is required")

    async def stream():
        async for chunk in execute_workflow(
            workflow_id=body.workflow_id,
            agent_id=body.agent_id,
            instruction=body.instruction,
            approval_mode=body.approval_mode,
            trigger_data=body.trigger_data,
            is_dry_run=False,
            workflow_name=body.workflow_name,
        ):
            yield chunk

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.post("/workflows/dry-run", dependencies=[Depends(verify_secret)])
async def dry_run_workflow_endpoint(body: ExecuteRequest):
    """Preview what a workflow would do without executing write tools."""
    if not body.instruction or not body.instruction.strip():
        raise HTTPException(status_code=400, detail="Workflow instruction is required")

    async def stream():
        async for chunk in execute_workflow(
            workflow_id=body.workflow_id,
            agent_id=body.agent_id,
            instruction=body.instruction,
            approval_mode=body.approval_mode,
            trigger_data=body.trigger_data,
            is_dry_run=True,
            workflow_name=body.workflow_name,
        ):
            yield chunk

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
