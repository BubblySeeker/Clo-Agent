"""
Chat routes for the AI service.

POST /ai/messages  — stream a response to a user message
POST /ai/confirm   — execute a pending write tool action after user confirmation
"""
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.routes import verify_secret
from app.services.agent import run_agent
from app.tools import execute_write_tool

router = APIRouter(prefix="/ai")


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class SendMessageRequest(BaseModel):
    conversation_id: str
    agent_id: str
    content: str
    prompt_mode: str = "chat"  # "chat", "workflow_creation", "workflow_execution"


class ConfirmRequest(BaseModel):
    pending_id: str
    agent_id: str


class UndoRequest(BaseModel):
    agent_id: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/messages", dependencies=[Depends(verify_secret)])
async def send_message(req: SendMessageRequest):
    """
    Stream an AI response via Server-Sent Events.

    SSE event shapes:
      {"type": "text",         "content": "..."}
      {"type": "tool_call",    "name": "...", "status": "running"}
      {"type": "tool_result",  "name": "...", "result": {...}}
      {"type": "confirmation", "tool": "...", "preview": {...}, "pending_id": "..."}
      [DONE]
    """
    # In workflow_creation mode, auto-approve workflow CRUD tools
    # so the AI can create/update workflows without confirmation cards
    approval = "auto" if req.prompt_mode == "workflow_creation" else None

    async def stream():
        async for chunk in run_agent(
            req.conversation_id,
            req.agent_id,
            req.content,
            prompt_mode=req.prompt_mode,
            approval_mode=approval,
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


@router.post("/confirm", dependencies=[Depends(verify_secret)])
async def confirm_action(req: ConfirmRequest):
    """Execute a pending write tool action after user confirmation."""
    result = await execute_write_tool(req.pending_id, req.agent_id)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return {"status": "executed", "result": result}


@router.post("/undo/{conversation_id}", dependencies=[Depends(verify_secret)])
async def undo_action(conversation_id: str, req: UndoRequest):
    """Pop the last auto-executed action and revert it."""
    from app.undo import pop_undo, execute_undo
    entry = pop_undo(conversation_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Nothing to undo")
    result = await execute_undo(entry, req.agent_id)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return {
        "status": "undone",
        "tool_name": entry["tool_name"],
        "entity_type": entry["entity_type"],
        "result": result,
    }
