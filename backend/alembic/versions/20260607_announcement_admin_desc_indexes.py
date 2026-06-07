"""use desc indexes for admin announcement sorting

Revision ID: 20260607_announcement_desc_idx
Revises: 20260607_admin_query_indexes
Create Date: 2026-06-07 00:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260607_announcement_desc_idx"
down_revision = "20260607_admin_query_indexes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    _drop_index_if_exists("announcement", "ix_announcement_admin_sort")
    _drop_index_if_exists("announcement", "ix_announcement_admin_status_sort")
    if _is_mysql():
        op.execute("CREATE INDEX ix_announcement_admin_sort ON announcement (is_deleted, sort_order, id DESC)")
        op.execute("CREATE INDEX ix_announcement_admin_status_sort ON announcement (is_deleted, is_published, sort_order, id DESC)")
    else:
        op.create_index("ix_announcement_admin_sort", "announcement", ["is_deleted", "sort_order", "id"], unique=False)
        op.create_index("ix_announcement_admin_status_sort", "announcement", ["is_deleted", "is_published", "sort_order", "id"], unique=False)


def downgrade() -> None:
    _drop_index_if_exists("announcement", "ix_announcement_admin_sort")
    _drop_index_if_exists("announcement", "ix_announcement_admin_status_sort")
    op.create_index("ix_announcement_admin_sort", "announcement", ["is_deleted", "sort_order", "id"], unique=False)
    op.create_index("ix_announcement_admin_status_sort", "announcement", ["is_deleted", "is_published", "sort_order", "id"], unique=False)


def _is_mysql() -> bool:
    return op.get_bind().dialect.name in {"mysql", "mariadb"}


def _index_exists(table_name: str, index_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return any(index["name"] == index_name for index in inspector.get_indexes(table_name))


def _drop_index_if_exists(table_name: str, index_name: str) -> None:
    if _index_exists(table_name, index_name):
        op.drop_index(index_name, table_name=table_name)
