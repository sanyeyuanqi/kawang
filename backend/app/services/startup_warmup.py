from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.database import async_session_factory
from app.models.order import OrderStatus

logger = logging.getLogger(__name__)


async def warm_database_pool(engine: AsyncEngine, connections: int = 6) -> None:
    async def ping() -> None:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))

    await asyncio.gather(*(ping() for _ in range(connections)))


async def warm_admin_read_caches() -> None:
    from app.api.v1.admin.announcements import list_announcements
    from app.api.v1.admin.categories import list_categories
    from app.api.v1.admin.code_keys import stock_summary
    from app.api.v1.admin.dashboard import dashboard
    from app.api.v1.admin.orders import list_orders
    from app.api.v1.admin.products import list_products

    admin = {"sub": "0", "role": "admin"}
    async with async_session_factory() as db:
        warmups: tuple[Callable[[], Awaitable[object]], ...] = (
            lambda: dashboard(admin, db, overview_offset=0, overview_limit=10),
            lambda: list_categories(admin, db, offset=0, limit=10),
            lambda: list_categories(admin, db, offset=0, limit=100),
            lambda: list_products(admin, db, q=None, options_only=False, offset=0, limit=10),
            lambda: list_products(admin, db, q=None, options_only=True, offset=0, limit=10),
            lambda: stock_summary(admin, db, offset=0, limit=10),
            lambda: list_announcements(admin, db, q=None, status="all", offset=0, limit=10),
            lambda: list_orders(admin, db, status=None, q=None, offset=0, limit=10),
            lambda: list_orders(admin, db, status=OrderStatus.PAID, q=None, offset=0, limit=10),
        )
        for warmup in warmups:
            try:
                await warmup()
            except Exception:
                logger.exception("Admin cache warmup failed")
                await db.rollback()
