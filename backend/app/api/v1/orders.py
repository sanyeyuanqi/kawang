import logging
import json
from time import perf_counter
from datetime import datetime
from decimal import Decimal
from fastapi import APIRouter, Depends, Request, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import PlainTextResponse
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import async_session_factory, get_db
from app.schemas.order import OrderCreateRequest
from app.services.order_service import OrderService
from app.services.code_service import CodeService, InsufficientStockError
from app.services.payment_events import payment_events
from app.services.payment_service import PaymentService
from app.services.product_sales import ProductSalesService
from app.utils.haozpay_client import haozpay_client
from app.models.order import Order, OrderStatus
from app.models.code_key import CodeKey, CodeKeyStatus
from app.config import settings
from app.api.deps import get_current_user, get_current_user_optional

logger = logging.getLogger(__name__)
router = APIRouter()
order_service = OrderService()
payment_service = PaymentService()


class TimingTrace:
    def __init__(self, name: str):
        self.name = name
        self.started_at = perf_counter()
        self.marks: list[tuple[str, float]] = []

    def mark(self, label: str) -> float:
        elapsed_ms = (perf_counter() - self.started_at) * 1000
        self.marks.append((label, elapsed_ms))
        return elapsed_ms

    def summary(self) -> str:
        parts = []
        previous = 0.0
        for label, elapsed_ms in self.marks:
            parts.append(f"{label}={elapsed_ms - previous:.2f}ms/{elapsed_ms:.2f}ms")
            previous = elapsed_ms
        return " ".join(parts)


def _status_value(status) -> str:
    return status.value if hasattr(status, "value") else str(status)


def _parse_cursor_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


ORDER_LIST_COLUMNS = (
    Order.id,
    Order.order_no,
    Order.status,
    Order.total_amount,
    Order.product_name,
    Order.quantity,
    Order.contact_info,
    Order.paid_at,
    Order.created_at,
)


async def _order_payload(db: AsyncSession, order: Order, include_codes: bool = True) -> dict:
    codes = []
    if include_codes and order.status == OrderStatus.PAID:
        code_stmt = select(CodeKey).where(CodeKey.order_id == order.id, CodeKey.status == CodeKeyStatus.ASSIGNED)
        codes = [{"id": c.id, "code_value": c.code_value} for c in (await db.execute(code_stmt)).scalars().all()]

    return {
        "order_no": order.order_no,
        "status": _status_value(order.status),
        "total_amount": str(order.total_amount),
        "product_name": order.product_name,
        "quantity": order.quantity,
        "contact_info": order.contact_info,
        "codes": codes,
        "paid_at": order.paid_at.strftime("%Y-%m-%d %H:%M:%S") if order.paid_at else None,
        "created_at": order.created_at.strftime("%Y-%m-%d %H:%M:%S") if order.created_at else None,
    }


async def _mark_order_paid(db: AsyncSession, order: Order, pay_channel: str = "") -> int:
    assigned_count = await db.scalar(select(func.count(CodeKey.id)).where(
        CodeKey.order_id == order.id,
        CodeKey.status == CodeKeyStatus.ASSIGNED,
        CodeKey.is_deleted == False,
    )) or 0
    reserved_count = await db.scalar(select(func.count(CodeKey.id)).where(
        CodeKey.order_id == order.id,
        CodeKey.status == CodeKeyStatus.RESERVED,
        CodeKey.is_deleted == False,
    )) or 0
    needed = max(order.quantity - assigned_count - reserved_count, 0)
    if needed:
        await CodeService.reserve_codes(db, order.product_id, needed, order.id)

    now = datetime.now()
    order.status = OrderStatus.PAID
    order.paid_at = now
    order.cancelled_at = None
    if pay_channel:
        order.pay_channel = pay_channel
    db.add(order)
    confirmed = await CodeService.confirm_codes(db, order.id)
    await ProductSalesService.increment_sold_count(db, order.product_id, order.quantity)
    return confirmed


def _order_list_payload(row) -> dict:
    return {
        "id": row.id,
        "order_no": row.order_no,
        "status": _status_value(row.status),
        "total_amount": str(row.total_amount),
        "product_name": row.product_name,
        "quantity": row.quantity,
        "contact_info": row.contact_info,
        "codes": [],
        "paid_at": row.paid_at.strftime("%Y-%m-%d %H:%M:%S") if row.paid_at else None,
        "created_at": row.created_at.strftime("%Y-%m-%d %H:%M:%S") if row.created_at else None,
    }


def _order_status_event(order: Order) -> dict:
    return {
        "type": "order_status",
        "order_no": order.order_no,
        "status": _status_value(order.status),
        "paid_at": order.paid_at.strftime("%Y-%m-%d %H:%M:%S") if order.paid_at else None,
    }


@router.post("/orders")
async def create_order(
    req: OrderCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict | None = Depends(get_current_user_optional),
):
    notify_url = f"{settings.SITE_URL}/api/v1/orders/callback"
    result = await order_service.create_order(
        db=db, product_id=req.product_id, quantity=req.quantity,
        contact_info=req.contact_info, pay_type=req.pay_type,
        user_id=int(current_user["sub"]) if current_user else None,
        notify_url=notify_url,
    )
    return {"code": 200, "msg": "success", "data": result}


@router.post("/orders/callback")
async def payment_callback(request: Request, db: AsyncSession = Depends(get_db)):
    try:
        raw_body = await request.body()
        params = json.loads(raw_body.decode("utf-8"), parse_float=str, parse_int=str)
    except Exception:
        form_data = await request.form()
        params = dict(form_data)
    order_no = params.get("orderNo") or params.get("OrderNo") or ""
    logger.info(f"[callback] received for {order_no}")

    is_valid = await haozpay_client.verify_callback(params)
    if not is_valid:
        logger.warning(f"[callback] invalid signature for {order_no}")
        return PlainTextResponse("fail")

    merchant_no = params.get("merchantNo") or params.get("MerchantNo")
    if settings.HAOZPAY_MERCHANT_NO and merchant_no != settings.HAOZPAY_MERCHANT_NO:
        logger.warning(f"[callback] merchant mismatch for {order_no}: {merchant_no}")
        return PlainTextResponse("fail")

    stmt = select(Order).where((Order.order_no == order_no) | (Order.haozpay_seq_id == order_no)).with_for_update()
    result = await db.execute(stmt)
    order = result.scalar_one_or_none()
    if not order:
        return PlainTextResponse("success")

    if order.status == OrderStatus.PAID:
        logger.info(f"[callback] {order_no} already paid, idempotent")
        return PlainTextResponse("success")

    pay_status = str(params.get("payStatus") or params.get("PayStatus") or "")
    if pay_status != "2":
        logger.info(f"[callback] {order_no} ignored payStatus={pay_status}")
        return PlainTextResponse("success")

    if order.status not in (OrderStatus.PENDING, OrderStatus.CANCELLED):
        return PlainTextResponse("success")

    pay_amount = params.get("payAmount") or params.get("PayAmount")
    if pay_amount is not None and Decimal(str(pay_amount)) != order.total_amount:
        logger.warning(f"[callback] amount mismatch for {order_no}: {pay_amount} != {order.total_amount}")
        return PlainTextResponse("fail")

    pay_channel = params.get("payChannel") or params.get("payType") or params.get("PayType") or ""
    try:
        confirmed = await _mark_order_paid(db, order, pay_channel)
    except InsufficientStockError as exc:
        logger.error("[callback] %s paid but stock recovery failed: %s", order_no, exc.message)
        return PlainTextResponse("fail")
    logger.info(f"[callback] {order_no} paid, confirmed {confirmed} codes")
    await db.commit()
    await payment_events.publish(order.order_no, _order_status_event(order))

    return PlainTextResponse("success")


@router.get("/orders/{order_no}/result")
async def get_order_result(order_no: str, db: AsyncSession = Depends(get_db)):
    stmt = select(Order).where(Order.order_no == order_no)
    result = await db.execute(stmt)
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail={"code": 404, "msg": "订单不存在", "data": None})

    if settings.HAOZPAY_QUERY_ENABLED and order.status in (OrderStatus.PENDING, OrderStatus.CANCELLED) and order.haozpay_seq_id:
        try:
            status = await payment_service.query_payment(order.haozpay_seq_id)
        except Exception:
            logger.exception("[payment-query] failed for order_no=%s gateway_order_no=%s", order.order_no, order.haozpay_seq_id)
        else:
            if status.pay_status == "2":
                paid_amount = status.pay_amount or status.order_amount
                if paid_amount and Decimal(str(paid_amount)) != order.total_amount:
                    logger.warning(
                        "[payment-query] amount mismatch for %s: %s != %s",
                        order.order_no,
                        paid_amount,
                        order.total_amount,
                    )
                else:
                    locked = await db.scalar(select(Order).where(Order.id == order.id).with_for_update())
                    if locked and locked.status in (OrderStatus.PENDING, OrderStatus.CANCELLED):
                        try:
                            confirmed = await _mark_order_paid(db, locked, status.pay_channel or status.pay_type)
                        except InsufficientStockError as exc:
                            logger.error("[payment-query] %s paid but stock recovery failed: %s", order.order_no, exc.message)
                        else:
                            await db.commit()
                            order = locked
                            logger.info("[payment-query] %s paid, confirmed %s codes", order.order_no, confirmed)
                            await payment_events.publish(order.order_no, _order_status_event(order))

    return {"code": 200, "msg": "success", "data": await _order_payload(db, order)}


@router.websocket("/orders/{order_no}/ws")
async def order_status_websocket(websocket: WebSocket, order_no: str):
    await payment_events.connect(order_no, websocket)
    try:
        async with async_session_factory() as db:
            order = await db.scalar(select(Order).where(Order.order_no == order_no))
            if order is None:
                await websocket.send_json({"type": "error", "code": 404, "msg": "订单不存在"})
                await websocket.close(code=4404)
                return
            await websocket.send_json(_order_status_event(order))

        while True:
            message = await websocket.receive_text()
            if message == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        pass
    finally:
        await payment_events.disconnect(order_no, websocket)


@router.get("/orders/mine")
async def get_my_orders(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    contact_info: str | None = Query(None, max_length=200),
    after_id: int = Query(0, ge=0),
    after_created_at: str | None = Query(None, max_length=40),
    limit: int = Query(10, ge=1, le=50),
):
    trace = TimingTrace("orders.mine")
    user_id = int(current_user["sub"])
    page_size = min(limit, 10)
    trace.mark("auth_dependency_done")

    await db.connection()
    trace.mark("db_connection_checkout")

    cursor_created_at = _parse_cursor_datetime(after_created_at)
    filters = [Order.user_id == user_id]
    if after_id > 0 and cursor_created_at is not None:
        filters.append(or_(Order.created_at < cursor_created_at, and_(Order.created_at == cursor_created_at, Order.id < after_id)))
    elif after_id > 0:
        filters.append(Order.id < after_id)

    stmt = (
        select(*ORDER_LIST_COLUMNS)
        .where(*filters)
        .order_by(Order.created_at.desc(), Order.id.desc())
        .limit(page_size + 1)
    )
    rows = (await db.execute(stmt)).all()
    trace.mark("query_order_rows")

    page_rows = rows[:page_size]
    records = [_order_list_payload(order) for order in page_rows]
    trace.mark("serialize_records")

    prev_cursor = page_rows[0].id if page_rows else after_id
    next_cursor = page_rows[-1].id if page_rows else after_id
    prev_cursor_created_at = records[0]["created_at"] if records else after_created_at
    next_cursor_created_at = records[-1]["created_at"] if records else after_created_at
    has_more = len(rows) > page_size

    data = {
        "records": records,
        "items": records,
        "count": len(records),
        "prev_cursor": prev_cursor,
        "next_cursor": next_cursor,
        "before_cursor": prev_cursor,
        "after_cursor": next_cursor,
        "prev_cursor_created_at": prev_cursor_created_at,
        "next_cursor_created_at": next_cursor_created_at,
        "before_cursor_created_at": prev_cursor_created_at,
        "after_cursor_created_at": next_cursor_created_at,
        "has_more": has_more,
        "limit": page_size,
    }
    trace.mark("build_response")

    logger.info(
        "[orders.mine.timing] user_id=%s contact_info_present=%s after_id=%s after_created_at=%s limit=%s returned=%s has_more=%s %s",
        user_id,
        bool(contact_info),
        after_id,
        after_created_at or "",
        page_size,
        len(records),
        has_more,
        trace.summary(),
    )

    return {
        "code": 200,
        "msg": "success",
        "data": data,
    }


@router.post("/orders/query")
async def query_orders(request: Request, db: AsyncSession = Depends(get_db)):
    body = await request.json()
    contact_info = str(body.get("contact_info", "")).strip()
    offset = max(int(body.get("offset", 0) or 0), 0)
    limit = min(max(int(body.get("limit", 10) or 10), 1), 50)
    after_id = max(int(body.get("after_id", 0) or 0), 0)
    cursor_created_at = _parse_cursor_datetime(body.get("after_created_at"))
    if not contact_info:
        return {"code": 400, "msg": "请输入联系方式", "data": None}

    filters = [Order.order_no == contact_info] if contact_info.upper().startswith("KW") else [Order.contact_info == contact_info]
    if after_id > 0 and cursor_created_at is not None:
        filters.append(or_(Order.created_at < cursor_created_at, and_(Order.created_at == cursor_created_at, Order.id < after_id)))
    elif after_id > 0:
        filters.append(Order.id < after_id)

    stmt = (
        select(*ORDER_LIST_COLUMNS)
        .where(*filters)
        .order_by(Order.created_at.desc(), Order.id.desc())
        .offset(0 if after_id > 0 else offset)
        .limit(limit + 1)
    )
    result = await db.execute(stmt)
    rows = result.all()
    orders = rows[:limit]
    items = [_order_list_payload(order) for order in orders]
    has_more = len(rows) > limit
    next_cursor = orders[-1].id if orders else after_id
    next_cursor_created_at = items[-1]["created_at"] if items else body.get("after_created_at")

    return {
        "code": 200,
        "msg": "success",
        "data": {
            "items": items,
            "total": offset + len(items) + (1 if has_more else 0),
            "offset": offset,
            "limit": limit,
            "next_cursor": next_cursor,
            "after_cursor": next_cursor,
            "next_cursor_created_at": next_cursor_created_at,
            "after_cursor_created_at": next_cursor_created_at,
            "has_more": has_more,
        },
    }
