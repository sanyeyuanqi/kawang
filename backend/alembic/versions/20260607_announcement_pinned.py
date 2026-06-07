"""add announcement pinned flag

Revision ID: 20260607_announcement_pinned
Revises: 20260607_add_announcements
Create Date: 2026-06-07 14:00:00.000000
"""

import sqlalchemy as sa
from alembic import op


revision = "20260607_announcement_pinned"
down_revision = "20260607_add_announcements"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "announcement",
        sa.Column("is_pinned", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index(
        "ix_announcement_pinned_public",
        "announcement",
        ["is_pinned", "is_published", "is_deleted", "updated_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_announcement_pinned_public", table_name="announcement")
    op.drop_column("announcement", "is_pinned")
