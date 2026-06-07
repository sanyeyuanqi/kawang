from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin
from app.database import get_db
from app.models.code_key import CodeKey, CodeKeyStatus
from app.models.order import Order, OrderStatus
from app.models.product import Product

router = APIRouter()


@router.get("/dashboard")
async def dashboard(_: dict = Depends(get_current_admin), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    tomorrow_start = today_start + timedelta(days=1)
    seven_days_ago = today_start - timedelta(days=6)

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
                func.coalesce(func.sum(case((Order.status == OrderStatus.PAID, 1), else_=0)), 0).label("paid_count"),
                func.coalesce(
                    func.sum(case(((Order.created_at >= today_start) & (Order.created_at < tomorrow_start), 1), else_=0)),
                    0,
                ).label("today_order_count"),
                func.coalesce(func.sum(case((Order.status == OrderStatus.PAID, Order.total_amount), else_=0)), 0).label("revenue"),
                func.coalesce(
                    func.sum(
                        case(
                            (
                                (Order.status == OrderStatus.PAID)
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

    day_rows = await db.execute(
        select(func.date(Order.paid_at), func.coalesce(func.sum(Order.total_amount), 0), func.count(Order.id))
        .where(Order.status == OrderStatus.PAID, Order.paid_at >= seven_days_ago)
        .group_by(func.date(Order.paid_at))
        .order_by(func.date(Order.paid_at))
    )
    overview_order_rows = await db.execute(
        select(Order)
        .where(
            or_(
                (Order.created_at >= today_start) & (Order.created_at < tomorrow_start),
                Order.status == OrderStatus.PENDING,
            )
        )
        .order_by(Order.created_at.desc())
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

    return {
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
                {"date": str(day), "revenue": str(amount), "orders": orders}
                for day, amount, orders in day_rows.all()
            ],
            "overview_orders": order_items,
            "today_orders": order_items,
            "recent_orders": order_items,
        },
    }
