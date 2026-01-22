"""Add gemini live tables

Revision ID: e4b8c2a91f23
Revises: d31026856c01
Create Date: 2026-01-21 03:00:00.000000

"""

from alembic import op
import sqlalchemy as sa

revision = "e4b8c2a91f23"
down_revision = "d31026856c01"
branch_labels = None
depends_on = None


def upgrade():
    # Create gemini_session table
    op.create_table(
        "gemini_session",
        sa.Column("id", sa.String(), nullable=False, primary_key=True, unique=True),
        sa.Column("user_id", sa.String(), nullable=True, index=True),
        sa.Column("title", sa.String(), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("status", sa.String(), nullable=True, default="active"),
        sa.Column("model", sa.String(), nullable=True),
        sa.Column("voice", sa.String(), nullable=True),
        sa.Column("message_count", sa.BigInteger(), nullable=True, default=0),
        sa.Column("last_summary_at", sa.BigInteger(), nullable=True),
        sa.Column("updated_at", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.BigInteger(), nullable=True),
    )

    # Create gemini_transcript table
    op.create_table(
        "gemini_transcript",
        sa.Column("id", sa.String(), nullable=False, primary_key=True, unique=True),
        sa.Column(
            "session_id",
            sa.String(),
            sa.ForeignKey("gemini_session.id"),
            nullable=True,
            index=True,
        ),
        sa.Column("role", sa.String(), nullable=True),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("audio_duration", sa.BigInteger(), nullable=True),
        sa.Column("timestamp", sa.BigInteger(), nullable=True),
    )

    # Create composite index for transcript queries
    op.create_index(
        "idx_transcript_session_timestamp",
        "gemini_transcript",
        ["session_id", "timestamp"],
    )


def downgrade():
    op.drop_index("idx_transcript_session_timestamp", table_name="gemini_transcript")
    op.drop_table("gemini_transcript")
    op.drop_table("gemini_session")
