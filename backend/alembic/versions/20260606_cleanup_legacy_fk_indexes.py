"""cleanup legacy foreign-key named indexes

Revision ID: 20260606_clean_fk_idx
Revises: 20260606_logic_fk_idx
Create Date: 2026-06-06 00:00:00.000000
"""

import sqlalchemy as sa
from alembic import op


revision = "20260606_clean_fk_idx"
down_revision = "20260606_logic_fk_idx"
branch_labels = None
depends_on = None


LEGACY_FK_NAMED_INDEXES: tuple[tuple[str, str], ...] = (
    ("fk_product_category_id_category", "product"),
    ("fk_order_product_id_product", "order"),
)

LOGICAL_INDEXES: tuple[tuple[str, str, list[str]], ...] = (
    ("ix_product_category_id", "product", ["category_id"]),
    ("ix_order_product_created", "order", ["product_id", "created_at", "id"]),
)


def upgrade() -> None:
    for index_name, table_name, columns in LOGICAL_INDEXES:
        _create_index_if_missing(index_name, table_name, columns)

    for index_name, table_name in LEGACY_FK_NAMED_INDEXES:
        _drop_index_if_exists(index_name, table_name)


def downgrade() -> None:
    for index_name, table_name, _columns in reversed(LOGICAL_INDEXES):
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
