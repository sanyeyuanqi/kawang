from __future__ import annotations

import csv
import io
from datetime import datetime
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin
from app.database import get_db
from app.models.code_key import CodeKey, CodeKeyStatus
from app.models.order import Order, OrderStatus
from app.services.code_service import CodeService
from app.services.payment_service import PaymentService

router = APIRouter()


class RefundPayload(BaseModel):
    amount: Decimal | None = None
    reason: str = "后台退款"


def _error(status_code: int, code: int, msg: str) -> None:
    from app.main import AppError

    raise AppError(code=code, msg=msg, status_code=status_code)


def _time(value: datetime | None) -> str | None:
    return value.strftime("%Y-%m-%d %H:%M:%S") if value else None


async def _codes(db: AsyncSession, order_id: int) -> list[dict[str, Any]]:
    rows = (await db.execute(select(CodeKey).where(CodeKey.order_id == order_id, CodeKey.is_deleted == False).order_by(CodeKey.id))).scalars().all()
    return [{"id": c.id, "code_value": c.code_value, "status": c.status.value if hasattr(c.status, "value") else c.status} for c in rows]


async def _order_dict(db: AsyncSession, order: Order, with_codes: bool = False) -> dict[str, Any]:
    data = {
        "id": order.id,
        "order_no": order.order_no,
        "product_id": order.product_id,
        "product_name": order.product_name,
        "product_price": str(order.product_price),
        "quantity": order.quantity,
        "total_amount": str(order.total_amount),
        "contact_info": order.contact_info,
        "status": order.status.value if hasattr(order.status, "value") else order.status,
        "pay_channel": order.pay_channel,
        "haozpay_seq_id": order.haozpay_seq_id,
        "refund_amount": str(order.refund_amount) if order.refund_amount is not None else None,
        "refund_seq_id": order.refund_seq_id,
        "paid_at": _time(order.paid_at),
        "cancelled_at": _time(order.cancelled_at),
        "created_at": _time(order.created_at),
    }
    if with_codes:
        data["codes"] = await _codes(db, order.id)
    return data


def _search_condition(q: str | None):
    if not q:
        return None
    like = f"%{q}%"
    return (Order.order_no.like(like)) | (Order.contact_info.like(like)) | (Order.product_name.like(like))


def _base_query(status: OrderStatus | None, q: str | None):
    stmt = select(Order)
    count_stmt = select(func.count(Order.id))
    conditions = []
    if status:
        conditions.append(Order.status == status)
    search_condition = _search_condition(q)
    if search_condition is not None:
        conditions.append(search_condition)
    for condition in conditions:
        stmt = stmt.where(condition)
        count_stmt = count_stmt.where(condition)
    return stmt, count_stmt


@router.get("/orders")
async def list_orders(
    _: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    status: OrderStatus | None = Query(None),
    q: str | None = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
) -> dict[str, Any]:
    stmt, count_stmt = _base_query(status, q)
    orders = (await db.execute(stmt.order_by(Order.id.desc()).offset(offset).limit(limit))).scalars().all()
    total = (await db.execute(count_stmt)).scalar() or 0
    stats_stmt = select(Order.status, func.count(Order.id)).group_by(Order.status)
    search_condition = _search_condition(q)
    if search_condition is not None:
        stats_stmt = stats_stmt.where(search_condition)
    stats_rows = (await db.execute(stats_stmt)).all()
    status_counts = {status_item.value if hasattr(status_item, "value") else status_item: int(count) for status_item, count in stats_rows}
    stats = {
        "all": sum(status_counts.values()),
        "pending": status_counts.get(OrderStatus.PENDING.value, 0),
        "paid": status_counts.get(OrderStatus.PAID.value, 0),
        "refunded": status_counts.get(OrderStatus.REFUNDED.value, 0),
        "cancelled": status_counts.get(OrderStatus.CANCELLED.value, 0),
    }
    return {"code": 200, "msg": "success", "data": {"items": [await _order_dict(db, o) for o in orders], "total": total, "offset": offset, "limit": limit, "stats": stats}}


@router.get("/orders/export")
async def export_orders(
    _: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    status: OrderStatus | None = Query(None),
    q: str | None = Query(None),
):
    stmt, _ = _base_query(status, q)
    orders = (await db.execute(stmt.order_by(Order.id.desc()))).scalars().all()
    stream = io.StringIO()
    writer = csv.writer(stream)
    writer.writerow(["order_no", "product_name", "quantity", "total_amount", "contact_info", "status", "created_at", "paid_at"])
    for order in orders:
        writer.writerow([order.order_no, order.product_name, order.quantity, order.total_amount, order.contact_info, order.status.value if hasattr(order.status, "value") else order.status, _time(order.created_at), _time(order.paid_at)])
    stream.seek(0)
    filename = f"orders-{datetime.now().strftime('%Y%m%d%H%M%S')}.csv"
    return StreamingResponse(
        iter([stream.getvalue().encode("utf-8-sig")]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/orders/{order_id}")
async def order_detail(order_id: int, _: dict = Depends(get_current_admin), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    order = (await db.execute(select(Order).where(Order.id == order_id))).scalar_one_or_none()
    if order is None:
        _error(404, 404, "订单不存在")
    return {"code": 200, "msg": "success", "data": await _order_dict(db, order, with_codes=True)}


@router.post("/orders/{order_id}/resend")
async def resend_codes(order_id: int, _: dict = Depends(get_current_admin), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    order = (await db.execute(select(Order).where(Order.id == order_id))).scalar_one_or_none()
    if order is None:
        _error(404, 404, "订单不存在")
    if order.status != OrderStatus.PAID:
        _error(400, 400, "只有已支付订单可以补发")
    assigned = await _codes(db, order.id)
    needed = max(order.quantity - len(assigned), 0)
    if needed:
        await CodeService.reserve_codes(db, order.product_id, needed, order.id)
        await CodeService.confirm_codes(db, order.id)
    await db.flush()
    return {"code": 200, "msg": "success", "data": await _order_dict(db, order, with_codes=True)}


@router.post("/orders/{order_id}/refund")
async def refund_order(
    order_id: int,
    payload: RefundPayload,
    _: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    order = (await db.execute(select(Order).where(Order.id == order_id).with_for_update())).scalar_one_or_none()
    if order is None:
        _error(404, 404, "订单不存在")
    if order.status != OrderStatus.PAID:
        _error(400, 400, "只有已支付订单可以退款")
    amount = payload.amount or order.total_amount
    if amount <= 0 or amount > order.total_amount:
        _error(400, 400, "退款金额无效")

    refund_result = await PaymentService().process_refund(order.order_no, int(amount * 100), payload.reason)
    order.status = OrderStatus.REFUNDED
    order.refund_amount = amount
    order.refund_seq_id = getattr(refund_result, "refund_seq_id", None)
    await CodeService.revoke_codes(db, order.id)
    await db.flush()
    return {"code": 200, "msg": "success", "data": await _order_dict(db, order, with_codes=True)}
