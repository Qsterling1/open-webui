"""
Gemini Live Session and Transcript Models

These models support persistent memory for Gemini Live sessions,
enabling context restoration after the 10-minute session timeout.
"""

import time
import uuid
from typing import Optional, List

from sqlalchemy.orm import Session
from open_webui.internal.db import Base, get_db_context
from pydantic import BaseModel, ConfigDict
from sqlalchemy import BigInteger, Column, String, Text, ForeignKey, Index


####################
# GeminiSession DB Schema
####################


class GeminiSession(Base):
    __tablename__ = "gemini_session"

    id = Column(String, primary_key=True, unique=True)
    user_id = Column(String, index=True)
    title = Column(String, nullable=True)  # Auto-generated from first message
    summary = Column(Text, nullable=True)  # Ollama-generated summary
    status = Column(String, default="active")  # active, timeout, ended
    model = Column(String, nullable=True)  # Gemini model used
    voice = Column(String, nullable=True)  # Voice used
    message_count = Column(BigInteger, default=0)
    last_summary_at = Column(BigInteger, nullable=True)  # Last summarization timestamp
    updated_at = Column(BigInteger)
    created_at = Column(BigInteger)


class GeminiSessionModel(BaseModel):
    id: str
    user_id: str
    title: Optional[str] = None
    summary: Optional[str] = None
    status: str = "active"
    model: Optional[str] = None
    voice: Optional[str] = None
    message_count: int = 0
    last_summary_at: Optional[int] = None
    updated_at: int
    created_at: int

    model_config = ConfigDict(from_attributes=True)


####################
# GeminiTranscript DB Schema
####################


class GeminiTranscript(Base):
    __tablename__ = "gemini_transcript"

    id = Column(String, primary_key=True, unique=True)
    session_id = Column(String, ForeignKey("gemini_session.id"), index=True)
    role = Column(String)  # user, assistant, system
    content = Column(Text)
    audio_duration = Column(BigInteger, nullable=True)  # Duration in ms if audio
    timestamp = Column(BigInteger)

    __table_args__ = (
        Index("idx_transcript_session_timestamp", "session_id", "timestamp"),
    )


class GeminiTranscriptModel(BaseModel):
    id: str
    session_id: str
    role: str
    content: str
    audio_duration: Optional[int] = None
    timestamp: int

    model_config = ConfigDict(from_attributes=True)


####################
# Forms
####################


class CreateSessionForm(BaseModel):
    model: Optional[str] = None
    voice: Optional[str] = None


class UpdateSessionForm(BaseModel):
    title: Optional[str] = None
    summary: Optional[str] = None
    status: Optional[str] = None


class CreateTranscriptForm(BaseModel):
    session_id: str
    role: str
    content: str
    audio_duration: Optional[int] = None


####################
# GeminiSessionsTable
####################


class GeminiSessionsTable:
    def create_session(
        self,
        user_id: str,
        model: Optional[str] = None,
        voice: Optional[str] = None,
        db: Optional[Session] = None,
    ) -> Optional[GeminiSessionModel]:
        with get_db_context(db) as db:
            id = str(uuid.uuid4())
            now = int(time.time())

            session = GeminiSessionModel(
                id=id,
                user_id=user_id,
                model=model,
                voice=voice,
                status="active",
                message_count=0,
                created_at=now,
                updated_at=now,
            )
            result = GeminiSession(**session.model_dump())
            db.add(result)
            db.commit()
            db.refresh(result)
            return GeminiSessionModel.model_validate(result) if result else None

    def get_session_by_id(
        self, id: str, db: Optional[Session] = None
    ) -> Optional[GeminiSessionModel]:
        with get_db_context(db) as db:
            try:
                session = db.get(GeminiSession, id)
                return GeminiSessionModel.model_validate(session) if session else None
            except Exception:
                return None

    def get_sessions_by_user_id(
        self,
        user_id: str,
        limit: int = 50,
        offset: int = 0,
        db: Optional[Session] = None,
    ) -> List[GeminiSessionModel]:
        with get_db_context(db) as db:
            try:
                sessions = (
                    db.query(GeminiSession)
                    .filter_by(user_id=user_id)
                    .order_by(GeminiSession.updated_at.desc())
                    .offset(offset)
                    .limit(limit)
                    .all()
                )
                return [GeminiSessionModel.model_validate(s) for s in sessions]
            except Exception:
                return []

    def get_active_session_by_user_id(
        self, user_id: str, db: Optional[Session] = None
    ) -> Optional[GeminiSessionModel]:
        with get_db_context(db) as db:
            try:
                session = (
                    db.query(GeminiSession)
                    .filter_by(user_id=user_id, status="active")
                    .order_by(GeminiSession.updated_at.desc())
                    .first()
                )
                return GeminiSessionModel.model_validate(session) if session else None
            except Exception:
                return None

    def update_session(
        self,
        id: str,
        user_id: str,
        title: Optional[str] = None,
        summary: Optional[str] = None,
        status: Optional[str] = None,
        db: Optional[Session] = None,
    ) -> Optional[GeminiSessionModel]:
        with get_db_context(db) as db:
            try:
                session = db.get(GeminiSession, id)
                if not session or session.user_id != user_id:
                    return None

                if title is not None:
                    session.title = title
                if summary is not None:
                    session.summary = summary
                    session.last_summary_at = int(time.time())
                if status is not None:
                    session.status = status

                session.updated_at = int(time.time())
                db.commit()
                db.refresh(session)
                return GeminiSessionModel.model_validate(session)
            except Exception:
                return None

    def increment_message_count(
        self, id: str, db: Optional[Session] = None
    ) -> Optional[GeminiSessionModel]:
        with get_db_context(db) as db:
            try:
                session = db.get(GeminiSession, id)
                if not session:
                    return None

                session.message_count = (session.message_count or 0) + 1
                session.updated_at = int(time.time())
                db.commit()
                db.refresh(session)
                return GeminiSessionModel.model_validate(session)
            except Exception:
                return None

    def delete_session(
        self, id: str, user_id: str, db: Optional[Session] = None
    ) -> bool:
        with get_db_context(db) as db:
            try:
                session = db.get(GeminiSession, id)
                if not session or session.user_id != user_id:
                    return False

                # Delete all transcripts for this session
                db.query(GeminiTranscript).filter_by(session_id=id).delete()
                db.delete(session)
                db.commit()
                return True
            except Exception:
                return False


####################
# GeminiTranscriptsTable
####################


class GeminiTranscriptsTable:
    def add_transcript(
        self,
        session_id: str,
        role: str,
        content: str,
        audio_duration: Optional[int] = None,
        db: Optional[Session] = None,
    ) -> Optional[GeminiTranscriptModel]:
        with get_db_context(db) as db:
            id = str(uuid.uuid4())
            now = int(time.time())

            transcript = GeminiTranscriptModel(
                id=id,
                session_id=session_id,
                role=role,
                content=content,
                audio_duration=audio_duration,
                timestamp=now,
            )
            result = GeminiTranscript(**transcript.model_dump())
            db.add(result)
            db.commit()
            db.refresh(result)

            # Increment message count on session
            GeminiSessions.increment_message_count(session_id, db)

            return GeminiTranscriptModel.model_validate(result) if result else None

    def get_transcripts_by_session_id(
        self,
        session_id: str,
        limit: int = 100,
        offset: int = 0,
        db: Optional[Session] = None,
    ) -> List[GeminiTranscriptModel]:
        with get_db_context(db) as db:
            try:
                transcripts = (
                    db.query(GeminiTranscript)
                    .filter_by(session_id=session_id)
                    .order_by(GeminiTranscript.timestamp.asc())
                    .offset(offset)
                    .limit(limit)
                    .all()
                )
                return [GeminiTranscriptModel.model_validate(t) for t in transcripts]
            except Exception:
                return []

    def get_recent_transcripts(
        self,
        session_id: str,
        limit: int = 50,
        db: Optional[Session] = None,
    ) -> List[GeminiTranscriptModel]:
        """Get the most recent transcripts for context restoration."""
        with get_db_context(db) as db:
            try:
                transcripts = (
                    db.query(GeminiTranscript)
                    .filter_by(session_id=session_id)
                    .order_by(GeminiTranscript.timestamp.desc())
                    .limit(limit)
                    .all()
                )
                # Reverse to get chronological order
                transcripts.reverse()
                return [GeminiTranscriptModel.model_validate(t) for t in transcripts]
            except Exception:
                return []

    def get_transcript_count(
        self, session_id: str, db: Optional[Session] = None
    ) -> int:
        with get_db_context(db) as db:
            try:
                return (
                    db.query(GeminiTranscript)
                    .filter_by(session_id=session_id)
                    .count()
                )
            except Exception:
                return 0

    def get_transcripts_since(
        self,
        session_id: str,
        since_timestamp: int,
        db: Optional[Session] = None,
    ) -> List[GeminiTranscriptModel]:
        """Get transcripts since a given timestamp (for incremental sync)."""
        with get_db_context(db) as db:
            try:
                transcripts = (
                    db.query(GeminiTranscript)
                    .filter(
                        GeminiTranscript.session_id == session_id,
                        GeminiTranscript.timestamp > since_timestamp,
                    )
                    .order_by(GeminiTranscript.timestamp.asc())
                    .all()
                )
                return [GeminiTranscriptModel.model_validate(t) for t in transcripts]
            except Exception:
                return []

    def delete_transcripts_by_session_id(
        self, session_id: str, db: Optional[Session] = None
    ) -> bool:
        with get_db_context(db) as db:
            try:
                db.query(GeminiTranscript).filter_by(session_id=session_id).delete()
                db.commit()
                return True
            except Exception:
                return False

    def format_transcript_for_context(
        self, transcripts: List[GeminiTranscriptModel]
    ) -> str:
        """Format transcripts as text for context injection."""
        lines = []
        for t in transcripts:
            role_label = "USER" if t.role == "user" else "GEMINI"
            lines.append(f"[{role_label}]: {t.content}")
        return "\n".join(lines)


# Singleton instances
GeminiSessions = GeminiSessionsTable()
GeminiTranscripts = GeminiTranscriptsTable()
