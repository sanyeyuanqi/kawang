"""add order delivery info

Revision ID: 20260607_order_delivery_info
Revises: 20260607_product_type_delivery
Create Date: 2026-06-07 23:45:00.000000
"""

import sqlalchemy as sa
from alembic import op


revision = "20260607_order_delivery_info"
down_revision = "20260607_product_type_delivery"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if not _column_exists("order", "delivery_info"):
        op.add_column("order", sa.Column("delivery_info", sa.Text(), nullable=True))


def downgrade() -> None:
    if _column_exists("order", "delivery_info"):
        op.drop_column("order", "delivery_info")


def _column_exists(table_name: str, column_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return any(column["name"] == column_name for column in inspector.get_columns(table_name))
