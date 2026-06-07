from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine
from sqlalchemy.ext.asyncio import AsyncSession

_INDEX_EXISTS_CACHE: dict[tuple[str, str], bool] = {}
ADMIN_QUERY_INDEXES: tuple[tuple[str, str], ...] = (
    ("order", "ix_order_status_id"),
    ("order", "ix_order_status_paid_at"),
    ("code_key", "ix_code_key_deleted_product_status_created"),
    ("code_key", "ix_code_key_product_deleted_id"),
    ("code_key", "ix_code_key_product_status_deleted"),
    ("announcement", "ix_announcement_admin_sort"),
    ("announcement", "ix_announcement_admin_status_sort"),
)


async def mysql_index_exists(db: AsyncSession, table_name: str, index_name: str) -> bool:
    bind = db.get_bind()
    if bind.dialect.name not in {"mysql", "mariadb"}:
        return False

    cache_key = (table_name, index_name)
    cached = _INDEX_EXISTS_CACHE.get(cache_key)
    if cached is not None:
        return cached

    safe_table_name = table_name.replace("`", "``")
    row = (
        await db.execute(
            text(f"SHOW INDEX FROM `{safe_table_name}` WHERE Key_name = :index_name"),
            {"index_name": index_name},
        )
    ).first()
    exists = row is not None
    _INDEX_EXISTS_CACHE[cache_key] = exists
    return exists


async def preload_mysql_index_cache(engine: AsyncEngine, indexes: tuple[tuple[str, str], ...] = ADMIN_QUERY_INDEXES) -> None:
    if engine.dialect.name not in {"mysql", "mariadb"}:
        return

    async with engine.connect() as conn:
        for table_name, index_name in indexes:
            cache_key = (table_name, index_name)
            if cache_key in _INDEX_EXISTS_CACHE:
                continue
            safe_table_name = table_name.replace("`", "``")
            row = (
                await conn.execute(
                    text(f"SHOW INDEX FROM `{safe_table_name}` WHERE Key_name = :index_name"),
                    {"index_name": index_name},
                )
            ).first()
            _INDEX_EXISTS_CACHE[cache_key] = row is not None
