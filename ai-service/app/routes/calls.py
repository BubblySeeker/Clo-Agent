"""
Call transcription pipeline route.
Triggered by Go backend after a recording is downloaded locally.
Acknowledges immediately, then processes transcription + analysis async.
"""
import asyncio
import json
import logging

import psycopg2.extras
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.config import AI_SERVICE_SECRET
from app.database import get_conn, run_query
from app.services.transcription import split_channels_and_transcribe
from app.services.call_analysis import analyze_transcript, build_ai_actions
from app.services.embeddings import generate_embedding, upsert_embedding

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai")


def _verify_secret(request: Request) -> bool:
    """Verify the shared service secret header."""
    return request.headers.get("X-AI-Service-Secret") == AI_SERVICE_SECRET


@router.post("/calls/process-recording")
async def process_recording(request: Request):
    """Accept a recording processing request and spawn async pipeline.

    Called by Go backend after downloadAndStoreRecording completes.
    Returns immediately with status=processing.
    """
    if not _verify_secret(request):
        return JSONResponse(status_code=403, content={"error": "unauthorized"})

    body = await request.json()
    call_id = body.get("call_id")
    agent_id = body.get("agent_id")
    local_path = body.get("local_path")

    if not all([call_id, agent_id, local_path]):
        return JSONResponse(
            status_code=400,
            content={"error": "call_id, agent_id, and local_path are required"},
        )

    # Create initial transcript row and update call_logs status
    def _init_transcript():
        with get_conn() as conn:
            cur = conn.cursor()
            cur.execute(
                f"SET LOCAL app.current_agent_id = '{agent_id}'"
            )
            cur.execute(
                """INSERT INTO call_transcripts (call_id, agent_id, full_text, status)
                   VALUES (%s, %s, '', 'processing')
                   ON CONFLICT (call_id) DO UPDATE SET status = 'processing'""",
                (call_id, agent_id),
            )
            cur.execute(
                "UPDATE call_logs SET transcription_status = 'processing' WHERE id = %s",
                (call_id,),
            )

    await run_query(_init_transcript)

    # Spawn async pipeline (fire and forget)
    asyncio.create_task(run_transcription_pipeline(call_id, agent_id, local_path))

    return {"status": "processing"}


async def run_transcription_pipeline(call_id: str, agent_id: str, local_path: str):
    """Full transcription + analysis pipeline. Runs as background task.

    Steps:
    1. Query call metadata (direction, contact_id, duration)
    2. Split dual-channel audio and transcribe each channel
    3. Get contact context for analysis (if contact exists)
    4. Analyze transcript with Claude
    5. Build AI action items
    6. Store results in call_transcripts
    7. Update call_logs.transcription_status
    8. Embed summary for semantic search
    """
    try:
        # Step 1: Get call metadata
        def _get_call_info():
            with get_conn() as conn:
                cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
                cur.execute(
                    "SELECT direction, contact_id, duration, started_at FROM call_logs WHERE id = %s AND agent_id = %s",
                    (call_id, agent_id),
                )
                return cur.fetchone()

        call_info = await run_query(_get_call_info)
        if not call_info:
            logger.error("Transcription pipeline: call %s not found", call_id)
            await _set_failed(call_id, agent_id)
            return

        direction = call_info["direction"] or "outbound"
        contact_id = call_info.get("contact_id")
        duration = call_info.get("duration") or 0
        started_at = call_info.get("started_at")

        # Step 2: Transcribe
        logger.info("Transcribing call %s (%s, %ds)", call_id, direction, duration)
        full_text, speaker_segments = await asyncio.to_thread(
            split_channels_and_transcribe, local_path, direction
        )

        # Step 3: Get contact context for analysis
        contact_context = {}
        if contact_id:
            def _get_contact_context():
                with get_conn() as conn:
                    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
                    cur.execute(
                        "SELECT first_name, last_name, email, phone, source FROM contacts WHERE id = %s AND agent_id = %s",
                        (contact_id, agent_id),
                    )
                    contact = cur.fetchone()
                    if contact:
                        ctx = {
                            "name": f"{contact['first_name']} {contact['last_name']}",
                            "email": contact.get("email"),
                            "phone": contact.get("phone"),
                            "source": contact.get("source"),
                        }
                        # Check for buyer profile
                        cur.execute(
                            "SELECT budget_min, budget_max, bedrooms, locations, property_type, timeline FROM buyer_profiles WHERE contact_id = %s",
                            (contact_id,),
                        )
                        bp = cur.fetchone()
                        if bp:
                            ctx["buyer_profile"] = dict(bp)
                        return ctx
                    return {}

            contact_context = await run_query(_get_contact_context)

        # Step 4: Analyze with Claude (graceful — save transcript even if analysis fails)
        call_metadata = {
            "direction": direction,
            "duration": duration,
            "date": str(started_at) if started_at else "unknown",
        }
        analysis = {}
        ai_actions = []
        try:
            logger.info("Analyzing transcript for call %s", call_id)
            analysis = await asyncio.to_thread(
                analyze_transcript, full_text, contact_context, call_metadata
            )
            # Step 5: Build AI actions
            ai_actions = build_ai_actions(
                analysis, str(contact_id) if contact_id else None, call_metadata
            )
        except Exception as e:
            logger.warning("AI analysis failed for call %s (transcript still saved): %s", call_id, e)

        # Step 6: Update call_transcripts with results
        word_count = len(full_text.split())

        def _update_transcript():
            with get_conn() as conn:
                cur = conn.cursor()
                cur.execute(
                    f"SET LOCAL app.current_agent_id = '{agent_id}'"
                )
                cur.execute(
                    """UPDATE call_transcripts
                       SET full_text = %s, speaker_segments = %s, ai_summary = %s,
                           ai_actions = %s, status = 'completed', duration_seconds = %s,
                           word_count = %s, completed_at = NOW()
                       WHERE call_id = %s AND agent_id = %s""",
                    (
                        full_text,
                        json.dumps(speaker_segments),
                        analysis.get("summary"),
                        json.dumps(ai_actions),
                        duration,
                        word_count,
                        call_id,
                        agent_id,
                    ),
                )

        await run_query(_update_transcript)

        # Step 7: Update call_logs status
        def _update_status():
            with get_conn() as conn:
                cur = conn.cursor()
                cur.execute(
                    "UPDATE call_logs SET transcription_status = 'completed' WHERE id = %s",
                    (call_id,),
                )

        await run_query(_update_status)

        # Step 8: Embed transcript summary for semantic search
        if full_text:
            summary = analysis.get("summary", "")
            key_quotes = analysis.get("key_quotes", [])
            embed_text = f"Call transcript ({direction}) - {summary}"
            if key_quotes:
                embed_text += f"\n\nKey quotes: {', '.join(key_quotes)}"

            try:
                embedding = await asyncio.to_thread(generate_embedding, embed_text)
                await run_query(
                    lambda: upsert_embedding(
                        "call_transcript", call_id, agent_id, embed_text, embedding
                    )
                )
            except Exception as e:
                logger.warning("Failed to embed transcript for call %s: %s", call_id, e)

        logger.info("Transcription pipeline complete for call %s", call_id)

    except Exception as e:
        logger.error("Transcription pipeline failed for call %s: %s", call_id, e, exc_info=True)
        await _set_failed(call_id, agent_id)


async def _set_failed(call_id: str, agent_id: str):
    """Mark transcript and call_logs as failed."""
    try:
        def _mark_failed():
            with get_conn() as conn:
                cur = conn.cursor()
                cur.execute(
                    f"SET LOCAL app.current_agent_id = '{agent_id}'"
                )
                cur.execute(
                    """UPDATE call_transcripts SET status = 'failed', completed_at = NOW()
                       WHERE call_id = %s AND agent_id = %s""",
                    (call_id, agent_id),
                )
                cur.execute(
                    "UPDATE call_logs SET transcription_status = 'failed' WHERE id = %s",
                    (call_id,),
                )

        await run_query(_mark_failed)
    except Exception as e:
        logger.error("Failed to mark call %s as failed: %s", call_id, e)
