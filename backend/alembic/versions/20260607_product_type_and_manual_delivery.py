"""add product type and manual delivery fields

Revision ID: 20260607_product_type_delivery
Revises: 20260607_order_user_deleted
Create Date: 2026-06-07 23:15:00.000000
"""

import sqlalchemy as sa
from alembic import op


revision = "20260607_product_type_delivery"
down_revision = "20260607_order_user_deleted"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if not _column_exists("product", "product_type"):
        op.add_column(
            "product",
            sa.Column("product_type", sa.String(length=32), nullable=False, server_default="auto_delivery"),
        )
    if not _column_exists("product", "preorder_stock"):
        op.add_column("product", sa.Column("preorder_stock", sa.Integer(), nullable=False, server_default="0"))
    if not _column_exists("order", "product_type"):
        op.add_column(
            "order",
            sa.Column("product_type", sa.String(length=32), nullable=False, server_default="auto_delivery"),
        )
    if not _column_exists("order", "delivered_at"):
        op.add_column("order", sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    if _column_exists("order", "delivered_at"):
        op.drop_column("order", "delivered_at")
    if _column_exists("order", "product_type"):
        op.drop_column("order", "product_type")
    if _column_exists("product", "preorder_stock"):
        op.drop_column("product", "preorder_stock")
    if _column_exists("product", "product_type"):
        op.drop_column("product", "product_type")


def _column_exists(table_name: str, column_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return any(column["name"] == column_name for column in inspector.get_columns(table_name))
