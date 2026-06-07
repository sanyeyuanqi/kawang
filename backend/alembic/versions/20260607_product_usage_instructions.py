"""add product usage instructions

Revision ID: 20260607_product_usage
Revises: 20260607_order_no_random_32
Create Date: 2026-06-07 21:30:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260607_product_usage"
down_revision = "20260607_order_no_random_32"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if not _column_exists("product", "usage_instructions"):
        op.add_column("product", sa.Column("usage_instructions", sa.Text(), nullable=True))


def downgrade() -> None:
    if _column_exists("product", "usage_instructions"):
        op.drop_column("product", "usage_instructions")


def _column_exists(table_name: str, column_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return any(column["name"] == column_name for column in inspector.get_columns(table_name))
