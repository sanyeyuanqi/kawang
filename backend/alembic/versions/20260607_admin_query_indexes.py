"""add admin query indexes

Revision ID: 20260607_admin_query_indexes
Revises: 20260607_order_delivery_info
Create Date: 2026-06-07 00:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260607_admin_query_indexes"
down_revision = "20260607_order_delivery_info"
branch_labels = None
depends_on = None


INDEXES: tuple[tuple[str, str, list[str]], ...] = (
    ("ix_order_status_id", "order", ["status", "id"]),
    ("ix_order_created_id", "order", ["created_at", "id"]),
    ("ix_code_key_deleted_product_status_created", "code_key", ["is_deleted", "product_id", "status", "created_at"]),
    ("ix_announcement_admin_sort", "announcement", ["is_deleted", "sort_order", "id"]),
    ("ix_announcement_admin_status_sort", "announcement", ["is_deleted", "is_published", "sort_order", "id"]),
)


def upgrade() -> None:
    for index_name, table_name, columns in INDEXES:
        _create_index_if_missing(index_name, table_name, columns)


def downgrade() -> None:
    for index_name, table_name, _columns in reversed(INDEXES):
        _drop_index_if_exists(index_name, table_name)


def _inspector() -> sa.Inspector:
    return sa.inspect(op.get_bind())


def _index_exists(table_name: str, index_name: str) -> bool:
    return any(index["name"] == index_name for index in _inspector().get_indexes(table_name))


def _create_index_if_missing(index_name: str, table_name: str, columns: list[str]) -> None:
    if not _index_exists(table_name, index_name):
        op.create_index(index_name, table_name, columns, unique=False)


def _drop_index_if_exists(index_name: str, table_name: str) -> None:
    if _index_exists(table_name, index_name):
        op.drop_index(index_name, table_name=table_name)
