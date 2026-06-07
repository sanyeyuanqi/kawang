"""add user deleted timestamp to orders

Revision ID: 20260607_order_user_deleted
Revises: 20260607_product_usage
Create Date: 2026-06-07 22:20:00.000000
"""

import sqlalchemy as sa
from alembic import op


revision = "20260607_order_user_deleted"
down_revision = "20260607_product_usage"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if not _column_exists("order", "user_deleted_at"):
        op.add_column("order", sa.Column("user_deleted_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    if _column_exists("order", "user_deleted_at"):
        op.drop_column("order", "user_deleted_at")


def _column_exists(table_name: str, column_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return any(column["name"] == column_name for column in inspector.get_columns(table_name))
