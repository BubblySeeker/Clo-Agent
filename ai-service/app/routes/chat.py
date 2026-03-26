"""
Chat routes for the AI service.

POST /ai/messages  — stream a response to a user message
POST /ai/confirm   — execute a pending write tool action after user confirmation
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.routes import verify_secret
from app.services.agent import run_agent
from app.tools import execute_write_tool

router = APIRouter(prefix="/ai")


class SendMessageRequest(BaseModel):
    conversation_id: str
    agent_id: str
    content: str


class ConfirmRequest(BaseModel):
    pending_id: str
    agent_id: str


@router.post("/messages", dependencies=[Depends(verify_secret)])
async def send_message(req: SendMessageRequest):
    """Stream an AI response via Server-Sent Events."""
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
    import logging
    logger = logging.getLogger(__name__)
    logger.info("Confirm request: pending_id=%s agent_id=%s", req.pending_id, req.agent_id)
    result = await execute_write_tool(req.pending_id, req.agent_id)
    logger.info("Confirm result: %s", result)
    if "error" in result:
        error_type = result.get("error_type", "")
        if error_type == "expired":
            raise HTTPException(status_code=410, detail=result["error"])
        raise HTTPException(status_code=400, detail=result["error"])
    return {"status": "executed", "result": result}
