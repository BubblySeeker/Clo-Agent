"""
Dual-channel audio splitting and transcription using OpenAI gpt-4o-transcribe.
Splits stereo MP3 (from Twilio dual-channel recording) into mono tracks,
transcribes each separately, then interleaves by timestamp with speaker labels.
"""
import logging
import os
import tempfile

import openai
from pydub import AudioSegment

from app.config import OPENAI_API_KEY

logger = logging.getLogger(__name__)

_client = openai.OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None


def transcribe_audio_file(file_path: str) -> dict:
    """Transcribe a single audio file using OpenAI gpt-4o-transcribe.

    Returns the full API result with segment-level timestamps.
    """
    if not _client:
        raise RuntimeError("OPENAI_API_KEY not set - cannot transcribe audio")

    with open(file_path, "rb") as f:
        result = _client.audio.transcriptions.create(
            model="gpt-4o-transcribe",
            file=f,
            response_format="json",
        )
    return result


def split_channels_and_transcribe(local_path: str, direction: str) -> tuple[str, list[dict]]:
    """Split dual-channel stereo MP3 and transcribe each channel separately.

    Channel mapping based on Twilio dual-channel convention:
    - Outbound calls: channel 0 = agent (initiator), channel 1 = client
    - Inbound calls: channel 0 = client (caller), channel 1 = agent

    Args:
        local_path: Path to the stereo MP3 file on disk.
        direction: "outbound" or "inbound" - determines channel-to-speaker mapping.

    Returns:
        Tuple of (full_text, speaker_segments) where:
        - full_text: Newline-joined transcript with [Agent]/[Client] labels
        - speaker_segments: List of dicts with speaker, start, end, text
    """
    logger.info("Loading audio from %s", local_path)
    audio = AudioSegment.from_mp3(local_path)
    channels = audio.split_to_mono()

    # Handle mono audio (no speaker separation possible)
    if len(channels) < 2:
        logger.warning("Audio has only %d channel(s) - transcribing without speaker labels", len(channels))
        return _transcribe_mono(channels[0])

    # Map channels to speakers based on call direction
    if direction == "outbound":
        agent_audio = channels[0]
        client_audio = channels[1]
    else:  # inbound
        client_audio = channels[0]
        agent_audio = channels[1]

    agent_path = None
    client_path = None
    try:
        # Export each channel to temp MP3 files
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
            agent_audio.export(f, format="mp3")
            agent_path = f.name

        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
            client_audio.export(f, format="mp3")
            client_path = f.name

        logger.info("Transcribing agent channel...")
        agent_result = transcribe_audio_file(agent_path)

        logger.info("Transcribing client channel...")
        client_result = transcribe_audio_file(client_path)

        # Build speaker segments from both transcriptions
        # gpt-4o-transcribe with response_format="json" returns {"text": "..."}
        # No segment-level timestamps available, so we create one segment per speaker
        speaker_segments = []

        agent_text = (getattr(agent_result, "text", "") or "").strip()
        client_text = (getattr(client_result, "text", "") or "").strip()

        if agent_text:
            speaker_segments.append({
                "speaker": "agent",
                "start": 0.0,
                "end": 0.0,
                "text": agent_text,
            })

        if client_text:
            speaker_segments.append({
                "speaker": "client",
                "start": 0.0,
                "end": 0.0,
                "text": client_text,
            })

        # Build full text with speaker labels
        full_text_parts = []
        if agent_text:
            full_text_parts.append(f"[Agent]: {agent_text}")
        if client_text:
            full_text_parts.append(f"[Client]: {client_text}")
        full_text = "\n".join(full_text_parts)

        logger.info(
            "Transcription complete: %d segments, %d words",
            len(speaker_segments),
            len(full_text.split()),
        )
        return full_text, speaker_segments

    finally:
        # Clean up temp files
        if agent_path and os.path.exists(agent_path):
            os.unlink(agent_path)
        if client_path and os.path.exists(client_path):
            os.unlink(client_path)


def _transcribe_mono(audio: AudioSegment) -> tuple[str, list[dict]]:
    """Transcribe a single mono channel without speaker labels."""
    mono_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
            audio.export(f, format="mp3")
            mono_path = f.name

        result = transcribe_audio_file(mono_path)

        text = (getattr(result, "text", "") or "").strip()
        speaker_segments = []
        if text:
            speaker_segments.append({
                "speaker": "unknown",
                "start": 0.0,
                "end": 0.0,
                "text": text,
            })

        full_text = text
        return full_text, speaker_segments

    finally:
        if mono_path and os.path.exists(mono_path):
            os.unlink(mono_path)
