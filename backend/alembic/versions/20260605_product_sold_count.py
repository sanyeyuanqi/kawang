"""add product sold count

Revision ID: 20260605_product_sold_count
Revises: 20260605_code_key_value_1000
Create Date: 2026-06-05 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260605_product_sold_count"
down_revision = "20260605_code_key_value_1000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("product", sa.Column("sold_count", sa.Integer(), nullable=False, server_default="0"))


def downgrade() -> None:
    op.drop_column("product", "sold_count")
