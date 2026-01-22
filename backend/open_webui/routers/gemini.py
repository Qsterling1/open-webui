"""
Gemini API Router for Open WebUI

Handles configuration and model management for Google Gemini integration,
including Gemini Live real-time audio/video streaming support.
"""

import logging
from typing import Optional, List

import aiohttp
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from open_webui.config import (
    GEMINI_API_KEYS,
    GEMINI_LIVE_ENABLED,
    GEMINI_LIVE_MODELS,
    GEMINI_LIVE_VOICE,
    GEMINI_LIVE_VOICES,
)
from open_webui.env import (
    AIOHTTP_CLIENT_TIMEOUT_MODEL_LIST,
    AIOHTTP_CLIENT_SESSION_SSL,
)
from open_webui.utils.auth import get_admin_user, get_verified_user
from open_webui.models.users import UserModel
from open_webui.models.gemini_live import (
    GeminiSessions,
    GeminiTranscripts,
    GeminiSessionModel,
    GeminiTranscriptModel,
    CreateSessionForm,
    CreateTranscriptForm,
    UpdateSessionForm,
)

log = logging.getLogger(__name__)

router = APIRouter()

GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"


####################################
# Pydantic Models
####################################


class GeminiConfigForm(BaseModel):
    api_keys: List[str]
    live_enabled: bool
    live_voice: str


class GeminiModelInfo(BaseModel):
    id: str
    name: str
    description: str
    input_token_limit: int
    output_token_limit: int
    supports_live: bool


class GeminiModelsResponse(BaseModel):
    models: List[GeminiModelInfo]


####################################
# Utility Functions
####################################


async def verify_gemini_api_key(api_key: str) -> bool:
    """Verify that a Gemini API key is valid by listing models."""
    if not api_key:
        return False

    url = f"{GEMINI_API_BASE_URL}/models?key={api_key}"
    timeout = aiohttp.ClientTimeout(total=AIOHTTP_CLIENT_TIMEOUT_MODEL_LIST)

    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(url, ssl=AIOHTTP_CLIENT_SESSION_SSL) as response:
                if response.status == 200:
                    return True
                else:
                    log.warning(f"Gemini API key verification failed: {response.status}")
                    return False
    except Exception as e:
        log.error(f"Error verifying Gemini API key: {e}")
        return False


async def fetch_gemini_models(api_key: str) -> List[dict]:
    """Fetch available models from the Gemini API."""
    if not api_key:
        return []

    url = f"{GEMINI_API_BASE_URL}/models?key={api_key}"
    timeout = aiohttp.ClientTimeout(total=AIOHTTP_CLIENT_TIMEOUT_MODEL_LIST)

    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(url, ssl=AIOHTTP_CLIENT_SESSION_SSL) as response:
                if response.status == 200:
                    data = await response.json()
                    return data.get("models", [])
                else:
                    log.warning(f"Failed to fetch Gemini models: {response.status}")
                    return []
    except Exception as e:
        log.error(f"Error fetching Gemini models: {e}")
        return []


####################################
# API Endpoints
####################################


@router.get("/config")
async def get_gemini_config(user=Depends(get_admin_user)):
    """Get the current Gemini configuration (admin only)."""
    return {
        "api_keys": GEMINI_API_KEYS.value,
        "live_enabled": GEMINI_LIVE_ENABLED.value,
        "live_voice": GEMINI_LIVE_VOICE.value,
        "live_voices": GEMINI_LIVE_VOICES,
        "live_models": GEMINI_LIVE_MODELS,
    }


@router.post("/config/update")
async def update_gemini_config(form_data: GeminiConfigForm, user=Depends(get_admin_user)):
    """Update the Gemini configuration (admin only)."""
    # Validate voice selection
    if form_data.live_voice not in GEMINI_LIVE_VOICES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid voice. Must be one of: {', '.join(GEMINI_LIVE_VOICES)}"
        )

    # Update configuration
    GEMINI_API_KEYS.value = form_data.api_keys
    GEMINI_API_KEYS.save()

    GEMINI_LIVE_ENABLED.value = form_data.live_enabled
    GEMINI_LIVE_ENABLED.save()

    GEMINI_LIVE_VOICE.value = form_data.live_voice
    GEMINI_LIVE_VOICE.save()

    return {
        "status": "ok",
        "api_keys": GEMINI_API_KEYS.value,
        "live_enabled": GEMINI_LIVE_ENABLED.value,
        "live_voice": GEMINI_LIVE_VOICE.value,
    }


@router.get("/config/user")
async def get_gemini_user_config(user=Depends(get_verified_user)):
    """Get Gemini configuration for regular users (limited info)."""
    has_key = bool(GEMINI_API_KEYS.value and GEMINI_API_KEYS.value[0])
    return {
        "enabled": has_key and GEMINI_LIVE_ENABLED.value,
        "live_voice": GEMINI_LIVE_VOICE.value,
        "live_voices": GEMINI_LIVE_VOICES,
        "live_models": GEMINI_LIVE_MODELS,
    }


@router.post("/verify")
async def verify_gemini_connection(user=Depends(get_admin_user)):
    """Verify the Gemini API connection using the configured API key."""
    api_keys = GEMINI_API_KEYS.value
    if not api_keys or not api_keys[0]:
        raise HTTPException(status_code=400, detail="No Gemini API key configured")

    is_valid = await verify_gemini_api_key(api_keys[0])

    if is_valid:
        return {"status": "ok", "message": "Gemini API connection verified"}
    else:
        raise HTTPException(status_code=401, detail="Invalid Gemini API key")


@router.get("/models")
async def get_gemini_models(user=Depends(get_verified_user)):
    """Get available Gemini models."""
    api_keys = GEMINI_API_KEYS.value
    if not api_keys or not api_keys[0]:
        return {"models": []}

    raw_models = await fetch_gemini_models(api_keys[0])

    # Transform and filter models
    models = []
    for model in raw_models:
        model_name = model.get("name", "").replace("models/", "")

        # Check if this model supports live/realtime
        supports_live = any(live_model in model_name for live_model in GEMINI_LIVE_MODELS)

        # Also check for generateContent support (basic requirement)
        supported_methods = model.get("supportedGenerationMethods", [])
        if "generateContent" not in supported_methods and not supports_live:
            continue

        models.append({
            "id": model_name,
            "name": model.get("displayName", model_name),
            "description": model.get("description", ""),
            "input_token_limit": model.get("inputTokenLimit", 0),
            "output_token_limit": model.get("outputTokenLimit", 0),
            "supports_live": supports_live,
        })

    return {"models": models}


@router.get("/models/live")
async def get_gemini_live_models(user=Depends(get_verified_user)):
    """Get Gemini models that support real-time audio/video (Live API)."""
    if not GEMINI_LIVE_ENABLED.value:
        return {"models": [], "enabled": False}

    api_keys = GEMINI_API_KEYS.value
    if not api_keys or not api_keys[0]:
        return {"models": [], "enabled": False}

    # Return the predefined live models
    # These are known to support the BidiGenerateContent WebSocket API
    live_models = [
        {
            "id": model_id,
            "name": model_id.replace("-", " ").title(),
            "supports_live": True,
        }
        for model_id in GEMINI_LIVE_MODELS
    ]

    return {
        "models": live_models,
        "enabled": True,
        "voice": GEMINI_LIVE_VOICE.value,
        "voices": GEMINI_LIVE_VOICES,
    }


@router.get("/api-key")
async def get_gemini_api_key_for_live(user=Depends(get_verified_user)):
    """
    Get the Gemini API key for frontend Live API connections.

    Note: This endpoint returns the API key to authenticated users for
    direct WebSocket connections to Google's Live API. The connection
    happens client-side for real-time audio/video streaming.
    """
    if not GEMINI_LIVE_ENABLED.value:
        raise HTTPException(status_code=403, detail="Gemini Live is not enabled")

    api_keys = GEMINI_API_KEYS.value
    if not api_keys or not api_keys[0]:
        raise HTTPException(status_code=400, detail="No Gemini API key configured")

    return {
        "api_key": api_keys[0],
        "voice": GEMINI_LIVE_VOICE.value,
    }


####################################
# Session Management Endpoints
####################################


@router.post("/session")
async def create_session(
    form_data: CreateSessionForm,
    user: UserModel = Depends(get_verified_user),
):
    """Create a new Gemini Live session for persistent memory tracking."""
    session = GeminiSessions.create_session(
        user_id=user.id,
        model=form_data.model,
        voice=form_data.voice,
    )
    if not session:
        raise HTTPException(status_code=500, detail="Failed to create session")
    return session


@router.get("/session/{session_id}")
async def get_session(
    session_id: str,
    user: UserModel = Depends(get_verified_user),
):
    """Get a specific Gemini Live session."""
    session = GeminiSessions.get_session_by_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this session")
    return session


@router.get("/sessions")
async def get_user_sessions(
    limit: int = 50,
    offset: int = 0,
    user: UserModel = Depends(get_verified_user),
):
    """Get all Gemini Live sessions for the current user."""
    sessions = GeminiSessions.get_sessions_by_user_id(
        user_id=user.id,
        limit=limit,
        offset=offset,
    )
    return {"sessions": sessions}


@router.get("/session/active")
async def get_active_session(
    user: UserModel = Depends(get_verified_user),
):
    """Get the most recent active session for the current user."""
    session = GeminiSessions.get_active_session_by_user_id(user.id)
    return {"session": session}


@router.put("/session/{session_id}")
async def update_session(
    session_id: str,
    form_data: UpdateSessionForm,
    user: UserModel = Depends(get_verified_user),
):
    """Update a Gemini Live session (title, summary, status)."""
    session = GeminiSessions.update_session(
        id=session_id,
        user_id=user.id,
        title=form_data.title,
        summary=form_data.summary,
        status=form_data.status,
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found or not authorized")
    return session


@router.delete("/session/{session_id}")
async def delete_session(
    session_id: str,
    user: UserModel = Depends(get_verified_user),
):
    """Delete a Gemini Live session and all its transcripts."""
    success = GeminiSessions.delete_session(session_id, user.id)
    if not success:
        raise HTTPException(status_code=404, detail="Session not found or not authorized")
    return {"status": "ok", "message": "Session deleted"}


####################################
# Transcript Management Endpoints
####################################


@router.post("/transcript")
async def add_transcript(
    form_data: CreateTranscriptForm,
    user: UserModel = Depends(get_verified_user),
):
    """Add a transcript entry to a Gemini Live session."""
    # Verify user owns the session
    session = GeminiSessions.get_session_by_id(form_data.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized to add to this session")

    transcript = GeminiTranscripts.add_transcript(
        session_id=form_data.session_id,
        role=form_data.role,
        content=form_data.content,
        audio_duration=form_data.audio_duration,
    )
    if not transcript:
        raise HTTPException(status_code=500, detail="Failed to add transcript")
    return transcript


@router.get("/transcripts/{session_id}")
async def get_transcripts(
    session_id: str,
    limit: int = 100,
    offset: int = 0,
    user: UserModel = Depends(get_verified_user),
):
    """Get all transcripts for a Gemini Live session."""
    # Verify user owns the session
    session = GeminiSessions.get_session_by_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this session")

    transcripts = GeminiTranscripts.get_transcripts_by_session_id(
        session_id=session_id,
        limit=limit,
        offset=offset,
    )
    return {"transcripts": transcripts}


@router.get("/transcripts/{session_id}/recent")
async def get_recent_transcripts(
    session_id: str,
    limit: int = 50,
    user: UserModel = Depends(get_verified_user),
):
    """Get the most recent transcripts for context restoration."""
    # Verify user owns the session
    session = GeminiSessions.get_session_by_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this session")

    transcripts = GeminiTranscripts.get_recent_transcripts(
        session_id=session_id,
        limit=limit,
    )

    # Also format for easy context injection
    formatted = GeminiTranscripts.format_transcript_for_context(transcripts)

    return {
        "transcripts": transcripts,
        "formatted": formatted,
        "count": len(transcripts),
    }


@router.get("/transcripts/{session_id}/since/{timestamp}")
async def get_transcripts_since(
    session_id: str,
    timestamp: int,
    user: UserModel = Depends(get_verified_user),
):
    """Get transcripts since a specific timestamp (for incremental sync)."""
    # Verify user owns the session
    session = GeminiSessions.get_session_by_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this session")

    transcripts = GeminiTranscripts.get_transcripts_since(
        session_id=session_id,
        since_timestamp=timestamp,
    )
    return {"transcripts": transcripts}


####################################
# Context Restoration Endpoint
####################################


@router.get("/context/{session_id}")
async def get_session_context(
    session_id: str,
    transcript_limit: int = 50,
    user: UserModel = Depends(get_verified_user),
):
    """
    Get full context for session restoration after timeout.

    Returns the session summary and recent transcripts formatted
    for injection into the Gemini Live system prompt.
    """
    # Verify user owns the session
    session = GeminiSessions.get_session_by_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this session")

    # Get recent transcripts
    transcripts = GeminiTranscripts.get_recent_transcripts(
        session_id=session_id,
        limit=transcript_limit,
    )
    formatted_transcripts = GeminiTranscripts.format_transcript_for_context(transcripts)

    # Build the context restoration prompt
    context_prompt = build_context_restoration_prompt(
        summary=session.summary,
        transcripts=formatted_transcripts,
    )

    return {
        "session": session,
        "transcripts": transcripts,
        "formatted_transcripts": formatted_transcripts,
        "context_prompt": context_prompt,
    }


def build_context_restoration_prompt(
    summary: Optional[str],
    transcripts: str,
) -> str:
    """Build the context restoration prompt for reconnection."""
    prompt_parts = [
        "[SESSION RESTORATION - Please read carefully before responding]",
        "",
    ]

    if summary:
        prompt_parts.extend([
            "PREVIOUS CONTEXT:",
            summary,
            "",
        ])

    if transcripts:
        prompt_parts.extend([
            "RECENT CONVERSATION:",
            transcripts,
            "",
        ])

    prompt_parts.extend([
        "CURRENT SCREEN:",
        "[Analyzing shared screen/webcam...]",
        "",
        "INSTRUCTIONS:",
        "1. Read the context and recent conversation carefully",
        "2. Look at what's currently on screen",
        "3. Use deductive reasoning to understand:",
        "   - What problem were we solving?",
        "   - What approach were we taking?",
        "   - Where did we leave off?",
        "   - What's the current state based on the screen?",
        "4. Begin your response with a brief confirmation:",
        '   "I see we were working on [X]. Based on the screen, it looks like [Y]. Let me continue from there..."',
        "5. Only proceed once you're confident you understand the context",
        "",
        "If anything is unclear, ask for clarification before continuing.",
    ])

    return "\n".join(prompt_parts)
