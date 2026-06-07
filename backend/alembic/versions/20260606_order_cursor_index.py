"""add order cursor index

Revision ID: 20260606_order_cursor_idx
Revises: 20260606_clean_fk_idx
Create Date: 2026-06-06 00:00:00.000000
"""

import sqlalchemy as sa
from alembic import op


revision = "20260606_order_cursor_idx"
down_revision = "20260606_clean_fk_idx"
branch_labels = None
depends_on = None


def upgrade() -> None:
    _create_index_if_missing("ix_order_id_created", "order", ["id", "created_at"])


def downgrade() -> None:
    _drop_index_if_exists("ix_order_id_created", "order")


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
