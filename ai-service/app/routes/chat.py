"""
Chat routes for the AI service.

POST /ai/messages  — stream a response to a user message
POST /ai/confirm   — execute a pending write tool action after user confirmation
"""
from fastapi import APIRouter, HTTPException, Header, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.config import AI_SERVICE_SECRET
from app.services.agent import run_agent
from app.tools import execute_write_tool

router = APIRouter(prefix="/ai")


# ---------------------------------------------------------------------------
# Auth dependency
# ---------------------------------------------------------------------------

def verify_secret(x_ai_service_secret: str = Header(...)):
    if x_ai_service_secret != AI_SERVICE_SECRET:
        raise HTTPException(status_code=403, detail="Invalid service secret")


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class SendMessageRequest(BaseModel):
    conversation_id: str
    agent_id: str
    content: str


class ConfirmRequest(BaseModel):
    pending_id: str
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
    async def stream():
        async for chunk in run_agent(req.conversation_id, req.agent_id, req.content):
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
    result = await execute_write_tool(req.pending_id)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return {"status": "executed", "result": result}
