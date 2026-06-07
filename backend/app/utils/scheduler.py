from __future__ import annotations

import logging
from datetime import timedelta

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import func, select

from app.config import settings
from app.database import async_session_factory
from app.models.order import Order, OrderStatus
from app.models.product import Product
from app.services.catalog_cache import invalidate_catalog_cache
from app.services.code_service import CodeService
from app.services.payment_events import payment_events

scheduler = AsyncIOScheduler()
logger = logging.getLogger(__name__)
PRODUCT_TYPE_PREORDER = "preorder"


async def cancel_expired_pending_orders() -> None:
    async with async_session_factory() as db:
        database_now = await db.scalar(select(func.now()))
        if database_now is None:
            logger.error("Unable to read database time while cancelling expired orders")
            return
        deadline = database_now - timedelta(minutes=settings.ORDER_EXPIRE_MINUTES)
        orders = (await db.execute(
            select(Order)
            .where(Order.status == OrderStatus.PENDING, Order.created_at < deadline)
            .order_by(Order.id.asc())
            .limit(100)
            .with_for_update()
        )).scalars().all()

        cancelled_count = 0
        released_count = 0
        preorder_product_ids: list[int] = []
        for order in orders:
            order.status = OrderStatus.CANCELLED
            order.cancelled_at = database_now
            if (order.product_type or "auto_delivery") == PRODUCT_TYPE_PREORDER:
                product = await db.scalar(select(Product).where(Product.id == order.product_id).with_for_update())
                if product is not None:
                    product.preorder_stock = int(product.preorder_stock or 0) + order.quantity
                    preorder_product_ids.append(product.id)
            else:
                released_count += await CodeService.release_codes(db, order.id)
            cancelled_count += 1

        if cancelled_count:
            if preorder_product_ids:
                await invalidate_catalog_cache(product_ids=preorder_product_ids, clear_products=True, clear_stock=True)
            await db.commit()
            logger.info("Cancelled %s expired pending orders, released %s code keys", cancelled_count, released_count)
            for order in orders:
                await payment_events.publish(order.order_no, {
                    "type": "order_status",
                    "order_no": order.order_no,
                    "status": OrderStatus.CANCELLED.value,
                    "paid_at": None,
                })


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
