"""use logical foreign keys and ensure query indexes

Revision ID: 20260606_logic_fk_idx
Revises: 20260605_product_query_indexes
Create Date: 2026-06-06 00:00:00.000000
"""

import sqlalchemy as sa
from alembic import op


revision = "20260606_logic_fk_idx"
down_revision = "20260605_product_query_indexes"
branch_labels = None
depends_on = None


INDEXES: tuple[tuple[str, str, list[str]], ...] = (
    ("ix_product_deleted_sort", "product", ["is_deleted", "sort_order", "id"]),
    ("ix_product_deleted_category_sort", "product", ["is_deleted", "category_id", "sort_order", "id"]),
    ("ix_code_key_product_status_deleted", "code_key", ["product_id", "status", "is_deleted"]),
    ("ix_code_key_order_status_deleted", "code_key", ["order_id", "status", "is_deleted"]),
    ("ix_code_key_product_deleted_id", "code_key", ["product_id", "is_deleted", "id"]),
    ("ix_order_contact_created", "order", ["contact_info", "created_at", "id"]),
    ("ix_order_user_created", "order", ["user_id", "created_at", "id"]),
    ("ix_order_status_created", "order", ["status", "created_at", "id"]),
    ("ix_order_status_paid_at", "order", ["status", "paid_at"]),
    ("ix_order_haozpay_seq_id", "order", ["haozpay_seq_id"]),
    ("ix_category_active_deleted_sort", "category", ["is_active", "is_deleted", "sort_order", "id"]),
    ("ix_category_deleted_sort", "category", ["is_deleted", "sort_order", "id"]),
)


def upgrade() -> None:
    _drop_all_foreign_keys("product")
    _drop_all_foreign_keys("order")
    _drop_all_foreign_keys("code_key")

    for index_name, table_name, columns in INDEXES:
        _create_index_if_missing(index_name, table_name, columns)


def downgrade() -> None:
    # Keep logical foreign keys on downgrade; recreating physical constraints can fail
    # when production data contains historical references.
    for index_name, table_name, _columns in reversed(INDEXES):
        _drop_index_if_exists(index_name, table_name)


def _inspector() -> sa.Inspector:
    return sa.inspect(op.get_bind())


def _drop_all_foreign_keys(table_name: str) -> None:
    inspector = _inspector()
    for fk in inspector.get_foreign_keys(table_name):
        name = fk.get("name")
        if name:
            op.drop_constraint(name, table_name, type_="foreignkey")


def _index_exists(table_name: str, index_name: str) -> bool:
    return any(index["name"] == index_name for index in _inspector().get_indexes(table_name))


def _create_index_if_missing(index_name: str, table_name: str, columns: list[str]) -> None:
    if not _index_exists(table_name, index_name):
        op.create_index(index_name, table_name, columns, unique=False)


def _drop_index_if_exists(index_name: str, table_name: str) -> None:
    if _index_exists(table_name, index_name):
        op.drop_index(index_name, table_name=table_name)
