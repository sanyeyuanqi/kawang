"""add product query indexes

Revision ID: 20260605_product_query_indexes
Revises: 20260605_product_sold_count
Create Date: 2026-06-05 00:00:00.000000
"""

import sqlalchemy as sa
from alembic import op


revision = "20260605_product_query_indexes"
down_revision = "20260605_product_sold_count"
branch_labels = None
depends_on = None


def upgrade() -> None:
    _create_index_if_missing("ix_product_deleted_sort", "product", ["is_deleted", "sort_order", "id"])
    _create_index_if_missing(
        "ix_product_deleted_category_sort",
        "product",
        ["is_deleted", "category_id", "sort_order", "id"],
    )
    _create_index_if_missing(
        "ix_code_key_product_status_deleted",
        "code_key",
        ["product_id", "status", "is_deleted"],
    )
    _create_index_if_missing(
        "ix_code_key_order_status_deleted",
        "code_key",
        ["order_id", "status", "is_deleted"],
    )
    _create_index_if_missing(
        "ix_code_key_product_deleted_id",
        "code_key",
        ["product_id", "is_deleted", "id"],
    )
    _create_index_if_missing("ix_order_contact_created", "order", ["contact_info", "created_at", "id"])
    _create_index_if_missing("ix_order_user_created", "order", ["user_id", "created_at", "id"])
    _create_index_if_missing("ix_order_status_created", "order", ["status", "created_at", "id"])
    _create_index_if_missing("ix_order_status_paid_at", "order", ["status", "paid_at"])
    _create_index_if_missing("ix_order_haozpay_seq_id", "order", ["haozpay_seq_id"])
    _create_index_if_missing(
        "ix_category_active_deleted_sort",
        "category",
        ["is_active", "is_deleted", "sort_order", "id"],
    )
    _create_index_if_missing("ix_category_deleted_sort", "category", ["is_deleted", "sort_order", "id"])


def downgrade() -> None:
    _drop_index_if_exists("ix_category_deleted_sort", "category")
    _drop_index_if_exists("ix_category_active_deleted_sort", "category")
    _drop_index_if_exists("ix_order_haozpay_seq_id", "order")
    _drop_index_if_exists("ix_order_status_paid_at", "order")
    _drop_index_if_exists("ix_order_status_created", "order")
    _drop_index_if_exists("ix_order_user_created", "order")
    _drop_index_if_exists("ix_order_contact_created", "order")
    _drop_index_if_exists("ix_code_key_product_deleted_id", "code_key")
    _drop_index_if_exists("ix_code_key_order_status_deleted", "code_key")
    _drop_index_if_exists("ix_code_key_product_status_deleted", "code_key")
    _drop_index_if_exists("ix_product_deleted_category_sort", "product")
    _drop_index_if_exists("ix_product_deleted_sort", "product")


def _index_exists(table_name: str, index_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return any(index["name"] == index_name for index in inspector.get_indexes(table_name))


def _create_index_if_missing(index_name: str, table_name: str, columns: list[str]) -> None:
    if not _index_exists(table_name, index_name):
        op.create_index(index_name, table_name, columns, unique=False)


def _drop_index_if_exists(index_name: str, table_name: str) -> None:
    if _index_exists(table_name, index_name):
        op.drop_index(index_name, table_name=table_name)
