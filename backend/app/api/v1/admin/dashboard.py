from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
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
    seven_days_ago = today_start - timedelta(days=6)

    product_count = (await db.execute(select(func.count(Product.id)).where(Product.is_deleted == False))).scalar() or 0
    pending_count = (await db.execute(select(func.count(Order.id)).where(Order.status == OrderStatus.PENDING))).scalar() or 0
    paid_count = (await db.execute(select(func.count(Order.id)).where(Order.status == OrderStatus.PAID))).scalar() or 0
    stock_count = (await db.execute(select(func.count(CodeKey.id)).where(CodeKey.status == CodeKeyStatus.UNUSED, CodeKey.is_deleted == False))).scalar() or 0
    revenue = (await db.execute(select(func.coalesce(func.sum(Order.total_amount), 0)).where(Order.status == OrderStatus.PAID))).scalar() or Decimal("0")
    today_revenue = (await db.execute(select(func.coalesce(func.sum(Order.total_amount), 0)).where(Order.status == OrderStatus.PAID, Order.paid_at >= today_start))).scalar() or Decimal("0")

    day_rows = await db.execute(
        select(func.date(Order.paid_at), func.coalesce(func.sum(Order.total_amount), 0), func.count(Order.id))
        .where(Order.status == OrderStatus.PAID, Order.paid_at >= seven_days_ago)
        .group_by(func.date(Order.paid_at))
        .order_by(func.date(Order.paid_at))
    )
    recent_rows = await db.execute(
        select(Order)
        .order_by(Order.created_at.desc())
        .limit(3)
    )
    recent_orders = recent_rows.scalars().all()

    return {
        "code": 200,
        "msg": "success",
        "data": {
            "stats": {
                "product_count": product_count,
                "available_stock": stock_count,
                "pending_orders": pending_count,
                "paid_orders": paid_count,
                "total_revenue": str(revenue),
                "today_revenue": str(today_revenue),
            },
            "daily": [
                {"date": str(day), "revenue": str(amount), "orders": orders}
                for day, amount, orders in day_rows.all()
            ],
            "recent_orders": [
                {
                    "id": order.id,
                    "order_no": order.order_no,
                    "product_name": order.product_name,
                    "contact_info": order.contact_info,
                    "status": order.status.value if hasattr(order.status, "value") else str(order.status),
                    "total_amount": str(order.total_amount),
                    "created_at": order.created_at.isoformat() if order.created_at else None,
                }
                for order in recent_orders
            ],
        },
    }
