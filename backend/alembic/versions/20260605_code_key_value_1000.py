"""increase code key value length

Revision ID: 20260605_code_key_value_1000
Revises: 20260603_unify_admin_into_user
Create Date: 2026-06-05 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260605_code_key_value_1000"
down_revision = "20260603_unify_admin_into_user"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index(op.f("ix_code_key_code_value"), table_name="code_key")
    op.alter_column(
        "code_key",
        "code_value",
        existing_type=sa.String(length=500),
        type_=sa.String(length=1000),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "code_key",
        "code_value",
        existing_type=sa.String(length=1000),
        type_=sa.String(length=500),
        existing_nullable=False,
    )
    op.create_index(op.f("ix_code_key_code_value"), "code_key", ["code_value"], unique=False)
