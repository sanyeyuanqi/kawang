from __future__ import annotations

import csv
import io
from datetime import datetime
from decimal import Decimal
from time import monotonic
from typing import Any

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin
from app.database import get_db
from app.models.code_key import CodeKey, CodeKeyStatus
from app.models.order import Order, OrderStatus
from app.models.product import Product
from app.services.catalog_cache import invalidate_catalog_cache
from app.services.code_service import CodeService
from app.services.payment_service import PaymentService
from app.utils.db_indexes import mysql_index_exists
from app.utils.haozpay_client import PaymentException

router = APIRouter()
PRODUCT_TYPE_PREORDER = "preorder"
_EXPORT_CACHE_TTL_SECONDS = 60
_ADMIN_ORDER_CACHE_TTL_SECONDS = 60
_export_cache: dict[tuple[str | None, str | None], tuple[float, str]] = {}
_admin_order_list_cache: dict[tuple[str | None, str | None, int, int], tuple[float, dict[str, Any]]] = {}
_admin_order_detail_cache: dict[int, tuple[float, dict[str, Any]]] = {}
ADMIN_ORDER_LIST_COLUMNS = (
    Order.id,
    Order.order_no,
    Order.product_id,
    Order.product_name,
    Order.product_price,
    Order.product_type,
    Order.quantity,
    Order.total_amount,
    Order.contact_info,
    Order.status,
    Order.pay_channel,
    Order.haozpay_seq_id,
    Order.refund_amount,
    Order.refund_seq_id,
    Order.paid_at,
    Order.delivered_at,
    Order.delivery_info,
    Order.cancelled_at,
    Order.created_at,
)


def clear_admin_order_cache() -> None:
    _export_cache.clear()
    _admin_order_list_cache.clear()
    _admin_order_detail_cache.clear()


class RefundPayload(BaseModel):
    amount: Decimal | None = None
    reason: str = "后台退款"
    force: bool = False


class DeliveryPayload(BaseModel):
    delivery_info: str = Field(..., min_length=1, max_length=2000)


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
        "product_type": order.product_type or "auto_delivery",
        "quantity": order.quantity,
        "total_amount": str(order.total_amount),
        "contact_info": order.contact_info,
        "status": order.status.value if hasattr(order.status, "value") else order.status,
        "pay_channel": order.pay_channel,
        "haozpay_seq_id": order.haozpay_seq_id,
        "refund_amount": str(order.refund_amount) if order.refund_amount is not None else None,
        "refund_seq_id": order.refund_seq_id,
        "paid_at": _time(order.paid_at),
        "delivered_at": _time(order.delivered_at),
        "delivery_info": order.delivery_info,
        "cancelled_at": _time(order.cancelled_at),
        "created_at": _time(order.created_at),
    }
    if with_codes:
        data["codes"] = await _codes(db, order.id)
    return data


def _order_row_dict(row: Any) -> dict[str, Any]:
    return {
        "id": row.id,
        "order_no": row.order_no,
        "product_id": row.product_id,
        "product_name": row.product_name,
        "product_price": str(row.product_price),
        "product_type": row.product_type or "auto_delivery",
        "quantity": row.quantity,
        "total_amount": str(row.total_amount),
        "contact_info": row.contact_info,
        "status": row.status.value if hasattr(row.status, "value") else row.status,
        "pay_channel": row.pay_channel,
        "haozpay_seq_id": row.haozpay_seq_id,
        "refund_amount": str(row.refund_amount) if row.refund_amount is not None else None,
        "refund_seq_id": row.refund_seq_id,
        "paid_at": _time(row.paid_at),
        "delivered_at": _time(row.delivered_at),
        "delivery_info": row.delivery_info,
        "cancelled_at": _time(row.cancelled_at),
        "created_at": _time(row.created_at),
    }


async def _refund_availability(order: Order) -> dict[str, Any]:
    checked_at = _time(datetime.now())
    if order.status not in (OrderStatus.PAID, OrderStatus.DELIVERED):
        return {"refund_available": False, "refund_unavailable_reason": "当前订单状态不可退款", "payment_query_status": None, "refund_checked_at": checked_at}

    gateway_order_no = order.haozpay_seq_id or ""
    if not gateway_order_no or gateway_order_no.startswith("AUTO-"):
        return {"refund_available": False, "refund_unavailable_reason": "订单没有可用的支付平台退款操作", "payment_query_status": None, "refund_checked_at": checked_at}

    return {"refund_available": True, "refund_unavailable_reason": None, "payment_query_status": "local_paid", "refund_checked_at": checked_at}


async def _order_detail_dict(db: AsyncSession, order: Order) -> dict[str, Any]:
    data = await _order_dict(db, order, with_codes=True)
    data.update(await _refund_availability(order))
    return data


def _search_condition(q: str | None):
    if not q:
        return None
    q = q.strip()
    if q.upper().startswith("KW"):
        return Order.order_no == q
    like = f"%{q}%"
    return (Order.order_no.like(like)) | (Order.contact_info.like(like)) | (Order.product_name.like(like))


def _base_query(status: OrderStatus | None, q: str | None):
    stmt = select(Order)
    conditions = []
    if status:
        conditions.append(Order.status == status)
    search_condition = _search_condition(q)
    if search_condition is not None:
        conditions.append(search_condition)
    for condition in conditions:
        stmt = stmt.where(condition)
    return stmt


@router.get("/orders")
async def list_orders(
    _: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    status: OrderStatus | None = Query(None),
    q: str | None = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
) -> dict[str, Any]:
    list_cache_key = (
        status.value if hasattr(status, "value") else status,
        q.strip() if q else None,
        offset,
        limit,
    )
    cached = _admin_order_list_cache.get(list_cache_key)
    if cached is not None and cached[0] > monotonic():
        return cached[1]

    stmt = _base_query(status, q)
    if status and _search_condition(q) is None and await mysql_index_exists(db, "order", "ix_order_status_id"):
        stmt = stmt.with_hint(Order, "FORCE INDEX (ix_order_status_id)", dialect_name="mysql")
    rows = (
        await db.execute(
            stmt.with_only_columns(*ADMIN_ORDER_LIST_COLUMNS)
            .order_by(Order.id.desc())
            .offset(offset)
            .limit(limit)
        )
    ).all()
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
        "delivered": status_counts.get(OrderStatus.DELIVERED.value, 0),
        "refunded": status_counts.get(OrderStatus.REFUNDED.value, 0),
        "cancelled": status_counts.get(OrderStatus.CANCELLED.value, 0),
    }
    total = stats.get(status.value, 0) if status else stats["all"]
    response = {"code": 200, "msg": "success", "data": {"items": [_order_row_dict(row) for row in rows], "total": total, "offset": offset, "limit": limit, "stats": stats}}
    _admin_order_list_cache[list_cache_key] = (monotonic() + _ADMIN_ORDER_CACHE_TTL_SECONDS, response)
    return response


@router.get("/orders/export")
async def export_orders(
    _: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    status: OrderStatus | None = Query(None),
    q: str | None = Query(None),
):
    export_cache_key = (status.value if hasattr(status, "value") else status, q.strip() if q else None)
    cached = _export_cache.get(export_cache_key)
    if cached is not None and cached[0] > monotonic():
        csv_text = cached[1]
    else:
        stmt = _base_query(status, q)
        if status and _search_condition(q) is None and await mysql_index_exists(db, "order", "ix_order_status_id"):
            stmt = stmt.with_hint(Order, "FORCE INDEX (ix_order_status_id)", dialect_name="mysql")
        rows = (
            await db.execute(
                stmt.with_only_columns(
                    Order.order_no,
                    Order.product_name,
                    Order.quantity,
                    Order.total_amount,
                    Order.contact_info,
                    Order.status,
                    Order.delivery_info,
                    Order.created_at,
                    Order.paid_at,
                )
                .order_by(Order.id.desc())
            )
        ).all()
        stream = io.StringIO()
        writer = csv.writer(stream)
        writer.writerow(["order_no", "product_name", "quantity", "total_amount", "contact_info", "status", "delivery_info", "created_at", "paid_at"])
        for row in rows:
            writer.writerow([
                row.order_no,
                row.product_name,
                row.quantity,
                row.total_amount,
                row.contact_info,
                row.status.value if hasattr(row.status, "value") else row.status,
                row.delivery_info or "",
                _time(row.created_at),
                _time(row.paid_at),
            ])
        csv_text = stream.getvalue()
        _export_cache[export_cache_key] = (monotonic() + _EXPORT_CACHE_TTL_SECONDS, csv_text)
    filename = f"orders-{datetime.now().strftime('%Y%m%d%H%M%S')}.csv"
    return StreamingResponse(
        iter([csv_text.encode("utf-8-sig")]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/orders/{order_id}")
async def order_detail(order_id: int, _: dict = Depends(get_current_admin), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    cached = _admin_order_detail_cache.get(order_id)
    if cached is not None and cached[0] > monotonic():
        return cached[1]
    order = (await db.execute(select(Order).where(Order.id == order_id))).scalar_one_or_none()
    if order is None:
        _error(404, 404, "订单不存在")
    response = {"code": 200, "msg": "success", "data": await _order_detail_dict(db, order)}
    _admin_order_detail_cache[order_id] = (monotonic() + _ADMIN_ORDER_CACHE_TTL_SECONDS, response)
    return response


@router.post("/orders/{order_id}/deliver")
async def deliver_order(
    order_id: int,
    payload: DeliveryPayload,
    _: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    order = (await db.execute(select(Order).where(Order.id == order_id).with_for_update())).scalar_one_or_none()
    if order is None:
        _error(404, 404, "订单不存在")
    if (order.product_type or "auto_delivery") != PRODUCT_TYPE_PREORDER:
        _error(400, 400, "只有提前抢购订单需要手动发货")
    if order.status != OrderStatus.PAID:
        _error(400, 400, "只有已支付且待发货订单可以确认发货")

    delivery_info = payload.delivery_info.strip()
    if not delivery_info:
        _error(400, 400, "请填写发货信息")
    order.status = OrderStatus.DELIVERED
    order.delivered_at = datetime.now()
    order.delivery_info = delivery_info
    await db.flush()
    clear_admin_order_cache()
    return {"code": 200, "msg": "success", "data": await _order_dict(db, order, with_codes=True)}


@router.post("/orders/{order_id}/resend")
async def resend_codes(order_id: int, _: dict = Depends(get_current_admin), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    order = (await db.execute(select(Order).where(Order.id == order_id))).scalar_one_or_none()
    if order is None:
        _error(404, 404, "订单不存在")
    if (order.product_type or "auto_delivery") == PRODUCT_TYPE_PREORDER:
        _error(400, 400, "提前抢购订单无需补发卡密")
    if order.status != OrderStatus.PAID:
        _error(400, 400, "只有已支付订单可以补发")
    assigned = await _codes(db, order.id)
    needed = max(order.quantity - len(assigned), 0)
    if needed:
        await CodeService.reserve_codes(db, order.product_id, needed, order.id)
        await CodeService.confirm_codes(db, order.id)
    await db.flush()
    clear_admin_order_cache()
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
    original_status = order.status
    if original_status not in (OrderStatus.PAID, OrderStatus.DELIVERED):
        _error(400, 400, "只有已支付或已发货订单可以退款")
    is_preorder = (order.product_type or "auto_delivery") == PRODUCT_TYPE_PREORDER
    is_fulfilled = original_status == OrderStatus.DELIVERED or (original_status == OrderStatus.PAID and not is_preorder)
    if is_fulfilled and not payload.force:
        _error(400, 400, "商品已发出，请确认强制退款")
    amount = payload.amount or order.total_amount
    if amount <= 0 or amount > order.total_amount:
        _error(400, 400, "退款金额无效")

    availability = await _refund_availability(order)
    if not availability["refund_available"]:
        _error(400, 400, availability["refund_unavailable_reason"] or "订单没有可用的退款操作")

    gateway_order_no = order.haozpay_seq_id or order.order_no
    try:
        refund_result = await PaymentService().process_refund(gateway_order_no, int(amount * 100), payload.reason)
    except PaymentException as exc:
        _error(502, 502, f"退款网关调用失败：{exc.message}")
    refund_seq_id = getattr(refund_result, "refund_seq_id", None)
    order.status = OrderStatus.REFUNDED
    order.refund_amount = amount
    order.refund_seq_id = refund_seq_id
    if is_preorder:
        product = await db.scalar(select(Product).where(Product.id == order.product_id).with_for_update())
        if product is not None and original_status == OrderStatus.PAID:
            product.preorder_stock = int(product.preorder_stock or 0) + order.quantity
            await invalidate_catalog_cache(product_ids=[product.id], clear_products=True, clear_stock=True)
    else:
        await CodeService.revoke_codes(db, order.id)
    await db.flush()
    clear_admin_order_cache()
    data = await _order_dict(db, order, with_codes=True)
    data.update({"refund_available": False, "refund_unavailable_reason": "当前订单状态不可退款", "payment_query_status": availability.get("payment_query_status"), "refund_checked_at": availability.get("refund_checked_at")})
    return {"code": 200, "msg": "success", "data": data}
