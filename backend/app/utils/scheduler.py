from __future__ import annotations

import logging
from datetime import datetime, timedelta

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select

from app.database import async_session_factory
from app.models.order import Order, OrderStatus
from app.services.code_service import CodeService

scheduler = AsyncIOScheduler()
logger = logging.getLogger(__name__)


async def cancel_expired_pending_orders() -> None:
    deadline = datetime.now() - timedelta(minutes=15)
    async with async_session_factory() as db:
        orders = (await db.execute(
            select(Order)
            .where(Order.status == OrderStatus.PENDING, Order.created_at < deadline)
            .order_by(Order.id.asc())
            .limit(100)
            .with_for_update()
        )).scalars().all()

        cancelled_count = 0
        released_count = 0
        now = datetime.now()
        for order in orders:
            order.status = OrderStatus.CANCELLED
            order.cancelled_at = now
            released_count += await CodeService.release_codes(db, order.id)
            cancelled_count += 1

        if cancelled_count:
            await db.commit()
            logger.info("Cancelled %s expired pending orders, released %s code keys", cancelled_count, released_count)


def start_scheduler():
    if scheduler.running:
        return
    scheduler.add_job(
        cancel_expired_pending_orders,
        "interval",
        seconds=60,
        id="cancel_expired_pending_orders",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    scheduler.start()


def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown(wait=False)
