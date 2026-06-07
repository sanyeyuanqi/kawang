"""expand order number for random suffix

Revision ID: 20260607_order_no_random_32
Revises: 20260607_announcement_pinned
Create Date: 2026-06-07 18:40:00.000000
"""

import sqlalchemy as sa
from alembic import op


revision = "20260607_order_no_random_32"
down_revision = "20260607_announcement_pinned"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("order") as batch_op:
        batch_op.alter_column(
            "order_no",
            existing_type=sa.String(length=32),
            type_=sa.String(length=34),
            existing_nullable=False,
        )


def downgrade() -> None:
    with op.batch_alter_table("order") as batch_op:
        batch_op.alter_column(
            "order_no",
            existing_type=sa.String(length=34),
            type_=sa.String(length=32),
            existing_nullable=False,
        )
