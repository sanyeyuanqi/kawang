from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal
from time import monotonic
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin
from app.database import get_db
from app.models.code_key import CodeKey, CodeKeyStatus
from app.models.order import Order, OrderStatus
from app.models.product import Product
from app.utils.db_indexes import mysql_index_exists

router = APIRouter()
_DASHBOARD_CACHE_TTL_SECONDS = 60
_dashboard_cache: dict[tuple[int, int], tuple[float, dict[str, Any]]] = {}


@router.get("/dashboard")
async def dashboard(
    _: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    overview_offset: int = Query(0, ge=0),
    overview_limit: int = Query(10, ge=1, le=50),
) -> dict[str, Any]:
    cache_key = (overview_offset, overview_limit)
    cached = _dashboard_cache.get(cache_key)
    if cached is not None and cached[0] > monotonic():
        return cached[1]

    today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    tomorrow_start = today_start + timedelta(days=1)
    seven_days_ago = today_start - timedelta(days=6)
    completed_statuses = (OrderStatus.PAID, OrderStatus.DELIVERED)

    product_count_subq = (
        select(func.count(Product.id))
        .where(Product.is_deleted == False)
        .scalar_subquery()
    )
    stock_count_subq = (
        select(func.count(CodeKey.id))
        .where(CodeKey.status == CodeKeyStatus.UNUSED, CodeKey.is_deleted == False)
        .scalar_subquery()
    )
    stats_row = (
        await db.execute(
            select(
                product_count_subq.label("product_count"),
                stock_count_subq.label("stock_count"),
                func.count(Order.id).label("total_order_count"),
                func.coalesce(func.sum(case((Order.status == OrderStatus.PENDING, 1), else_=0)), 0).label("pending_count"),
                func.coalesce(func.sum(case((Order.status.in_(completed_statuses), 1), else_=0)), 0).label("paid_count"),
                func.coalesce(
                    func.sum(case(((Order.created_at >= today_start) & (Order.created_at < tomorrow_start), 1), else_=0)),
                    0,
                ).label("today_order_count"),
                func.coalesce(func.sum(case((Order.status.in_(completed_statuses), Order.total_amount), else_=0)), 0).label("revenue"),
                func.coalesce(
                    func.sum(
                        case(
                            (
                                (Order.status.in_(completed_statuses))
                                & (Order.paid_at >= today_start)
                                & (Order.paid_at < tomorrow_start),
                                Order.total_amount,
                            ),
                            else_=0,
                        )
                    ),
                    0,
                ).label("today_revenue"),
            )
        )
    ).one()
    product_count = int(stats_row.product_count or 0)
    stock_count = int(stats_row.stock_count or 0)
    total_order_count = int(stats_row.total_order_count or 0)
    pending_count = int(stats_row.pending_count or 0)
    paid_count = int(stats_row.paid_count or 0)
    today_order_count = int(stats_row.today_order_count or 0)
    revenue = stats_row.revenue or Decimal("0")
    today_revenue = stats_row.today_revenue or Decimal("0")

    daily_stmt = (
        select(Order.paid_at, Order.total_amount)
        .where(Order.status.in_(completed_statuses), Order.paid_at >= seven_days_ago)
    )
    if await mysql_index_exists(db, "order", "ix_order_status_paid_at"):
        daily_stmt = daily_stmt.with_hint(Order, "FORCE INDEX (ix_order_status_paid_at)", dialect_name="mysql")
    day_rows = await db.execute(daily_stmt)
    daily_stats: dict[str, dict[str, Any]] = {}
    for paid_at, amount in day_rows.all():
        if paid_at is None:
            continue
        day_key = paid_at.date().isoformat()
        bucket = daily_stats.setdefault(day_key, {"amount": Decimal("0"), "orders": 0})
        bucket["amount"] += amount or Decimal("0")
        bucket["orders"] += 1
    overview_condition = or_(
        (Order.created_at >= today_start) & (Order.created_at < tomorrow_start),
        Order.status == OrderStatus.PENDING,
    )
    overview_total = await db.scalar(select(func.count(Order.id)).where(overview_condition)) or 0
    overview_order_rows = await db.execute(
        select(Order)
        .where(overview_condition)
        .order_by(Order.created_at.desc())
        .offset(overview_offset)
        .limit(overview_limit)
    )
    overview_orders = overview_order_rows.scalars().all()

    order_items = [
        {
            "id": order.id,
            "order_no": order.order_no,
            "product_name": order.product_name,
            "contact_info": order.contact_info,
            "status": order.status.value if hasattr(order.status, "value") else str(order.status),
            "total_amount": str(order.total_amount),
            "created_at": order.created_at.isoformat() if order.created_at else None,
        }
        for order in overview_orders
    ]

    response = {
        "code": 200,
        "msg": "success",
        "data": {
            "stats": {
                "product_count": product_count,
                "available_stock": stock_count,
                "total_orders": total_order_count,
                "pending_orders": pending_count,
                "paid_orders": paid_count,
                "today_orders": today_order_count,
                "total_revenue": str(revenue),
                "today_revenue": str(today_revenue),
            },
            "daily": [
                {"date": day, "revenue": str(stats["amount"]), "orders": stats["orders"]}
                for day, stats in sorted(daily_stats.items())
            ],
            "overview_orders": order_items,
            "today_orders": order_items,
            "recent_orders": order_items,
            "overview_total": int(overview_total),
            "overview_offset": overview_offset,
            "overview_limit": overview_limit,
        },
    }
    _dashboard_cache[cache_key] = (monotonic() + _DASHBOARD_CACHE_TTL_SECONDS, response)
    return response
