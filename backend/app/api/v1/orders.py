import logging
import json
from time import monotonic, perf_counter
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
from app.services.catalog_cache import invalidate_catalog_cache
from app.utils.haozpay_client import PaymentException, haozpay_client
from app.models.order import Order, OrderStatus
from app.models.code_key import CodeKey, CodeKeyStatus
from app.models.product import Product
from app.config import settings
from app.api.deps import get_current_user, get_current_user_optional
from app.api.v1.admin.orders import clear_admin_order_cache

logger = logging.getLogger(__name__)
router = APIRouter()
order_service = OrderService()
payment_service = PaymentService()
PRODUCT_TYPE_PREORDER = "preorder"
PAY_INFO_CACHE_TTL_SECONDS = 600
USER_ORDER_CACHE_TTL_SECONDS = 10
_pay_info_cache: dict[str, tuple[float, dict]] = {}
_user_order_cache: dict[int, dict[tuple[int, str | None, int], tuple[float, dict]]] = {}


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
    Order.product_type,
    Order.quantity,
    Order.contact_info,
    Order.paid_at,
    Order.delivered_at,
    Order.created_at,
)


async def _order_payload(db: AsyncSession, order: Order, include_codes: bool = True) -> dict:
    codes = []
    if include_codes and order.status in (OrderStatus.PAID, OrderStatus.DELIVERED) and order.product_type != PRODUCT_TYPE_PREORDER:
        code_stmt = select(CodeKey).where(CodeKey.order_id == order.id, CodeKey.status == CodeKeyStatus.ASSIGNED)
        codes = [{"id": c.id, "code_value": c.code_value} for c in (await db.execute(code_stmt)).scalars().all()]
    usage_instructions = await db.scalar(
        select(Product.usage_instructions).where(Product.id == order.product_id, Product.is_deleted == False)
    )

    return {
        "order_no": order.order_no,
        "status": _status_value(order.status),
        "total_amount": str(order.total_amount),
        "product_name": order.product_name,
        "product_type": order.product_type or "auto_delivery",
        "quantity": order.quantity,
        "contact_info": order.contact_info,
        "usage_instructions": usage_instructions,
        "codes": codes,
        "paid_at": order.paid_at.strftime("%Y-%m-%d %H:%M:%S") if order.paid_at else None,
        "delivered_at": order.delivered_at.strftime("%Y-%m-%d %H:%M:%S") if order.delivered_at else None,
        "delivery_info": order.delivery_info,
        "created_at": order.created_at.strftime("%Y-%m-%d %H:%M:%S") if order.created_at else None,
    }


async def _mark_order_paid(db: AsyncSession, order: Order, pay_channel: str = "") -> int:
    is_preorder = (order.product_type or "auto_delivery") == PRODUCT_TYPE_PREORDER
    if is_preorder:
        if order.status == OrderStatus.CANCELLED:
            product = await db.scalar(select(Product).where(Product.id == order.product_id).with_for_update())
            if product is None or product.is_deleted:
                raise InsufficientStockError("商品不存在，无法恢复订单")
            if int(product.preorder_stock or 0) < order.quantity:
                raise InsufficientStockError(f"库存不足，需要 {order.quantity} 件，可用 {int(product.preorder_stock or 0)} 件")
            product.preorder_stock = int(product.preorder_stock or 0) - order.quantity
            await invalidate_catalog_cache(product_ids=[product.id], clear_products=True, clear_stock=True)

        now = datetime.now()
        order.status = OrderStatus.PAID
        order.paid_at = now
        order.cancelled_at = None
        if pay_channel:
            order.pay_channel = pay_channel
        db.add(order)
        await ProductSalesService.increment_sold_count(db, order.product_id, order.quantity)
        return 0

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
        "product_type": row.product_type or "auto_delivery",
        "quantity": row.quantity,
        "contact_info": row.contact_info,
        "codes": [],
        "paid_at": row.paid_at.strftime("%Y-%m-%d %H:%M:%S") if row.paid_at else None,
        "delivered_at": row.delivered_at.strftime("%Y-%m-%d %H:%M:%S") if row.delivered_at else None,
        "created_at": row.created_at.strftime("%Y-%m-%d %H:%M:%S") if row.created_at else None,
    }


def _order_status_event(order: Order) -> dict:
    return {
        "type": "order_status",
        "order_no": order.order_no,
        "status": _status_value(order.status),
        "paid_at": order.paid_at.strftime("%Y-%m-%d %H:%M:%S") if order.paid_at else None,
    }


def _cached_pay_info(order_no: str) -> dict | None:
    item = _pay_info_cache.get(order_no)
    if item is None:
        return None
    expires_at, value = item
    if expires_at <= monotonic():
        _pay_info_cache.pop(order_no, None)
        return None
    return value


def _set_cached_pay_info(order_no: str, value: dict) -> None:
    _pay_info_cache[order_no] = (monotonic() + PAY_INFO_CACHE_TTL_SECONDS, value)


def _get_cached_user_orders(user_id: int, key: tuple[int, str | None, int]) -> dict | None:
    item = _user_order_cache.get(user_id, {}).get(key)
    if item is None:
        return None
    expires_at, value = item
    if expires_at <= monotonic():
        _user_order_cache.get(user_id, {}).pop(key, None)
        return None
    return value


def _set_cached_user_orders(user_id: int, key: tuple[int, str | None, int], value: dict) -> None:
    bucket = _user_order_cache.setdefault(user_id, {})
    bucket[key] = (monotonic() + USER_ORDER_CACHE_TTL_SECONDS, value)


def _clear_user_order_cache(user_id: int | None) -> None:
    if user_id is not None:
        _user_order_cache.pop(user_id, None)


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
    pay_info = result.get("pay_info") if isinstance(result, dict) else None
    order_no = result.get("order_no") if isinstance(result, dict) else None
    if order_no and isinstance(pay_info, dict):
        _set_cached_pay_info(order_no, pay_info)
    clear_admin_order_cache()
    _clear_user_order_cache(int(current_user["sub"]) if current_user else None)
    return {"code": 200, "msg": "success", "data": result}


@router.get("/orders/{order_no}/pay-info")
async def get_order_pay_info(order_no: str, db: AsyncSession = Depends(get_db)):
    stmt = select(Order).where(Order.order_no == order_no)
    order = await db.scalar(stmt)
    if not order:
        raise HTTPException(status_code=404, detail={"code": 404, "msg": "订单不存在", "data": None})
    if order.status != OrderStatus.PENDING:
        raise HTTPException(status_code=400, detail={"code": 400, "msg": "订单不是待支付状态", "data": None})

    cached = _cached_pay_info(order.order_no)
    if cached is not None:
        return {"code": 200, "msg": "success", "data": cached}

    notify_url = f"{settings.SITE_URL}/api/v1/orders/callback"
    amount_cents = int(order.total_amount * 100)
    try:
        pay_info = await order_service.payment_service.create_payment(
            order_no=order.order_no,
            order_title=order.product_name,
            amount=amount_cents,
            pay_type=0,
            notify_url=notify_url,
        )
    except PaymentException as e:
        raise HTTPException(
            status_code=502,
            detail={"code": 502, "msg": f"支付网关调用失败: {e.message}", "data": None},
        )

    order.haozpay_seq_id = pay_info.haozpay_seq_id
    db.add(order)
    await db.commit()
    data = {
        "pay_type": pay_info.pay_type,
        "html_form": pay_info.html_form,
        "qr_url": pay_info.qr_url,
        "qr_content": pay_info.qr_content,
        "haozpay_seq_id": pay_info.haozpay_seq_id,
    }
    _set_cached_pay_info(order.order_no, data)
    return {"code": 200, "msg": "success", "data": data}


@router.post("/orders/{order_no}/cancel")
async def cancel_order(order_no: str, request: Request, db: AsyncSession = Depends(get_db)):
    try:
        body = await request.json()
    except Exception:
        body = {}
    proof = str(body.get("contact_info", "")).strip()

    result = await db.execute(select(Order).where(Order.order_no == order_no).with_for_update())
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail={"code": 404, "msg": "订单不存在", "data": None})
    if not proof or proof not in (order.order_no, order.contact_info):
        raise HTTPException(status_code=403, detail={"code": 403, "msg": "订单信息不匹配", "data": None})
    if order.status != OrderStatus.PENDING:
        raise HTTPException(status_code=400, detail={"code": 400, "msg": "只有待支付订单可以取消", "data": None})

    order.status = OrderStatus.CANCELLED
    order.cancelled_at = datetime.now()
    if (order.product_type or "auto_delivery") == PRODUCT_TYPE_PREORDER:
        product = await db.scalar(select(Product).where(Product.id == order.product_id).with_for_update())
        if product is not None:
            product.preorder_stock = int(product.preorder_stock or 0) + order.quantity
            await invalidate_catalog_cache(product_ids=[product.id], clear_products=True, clear_stock=True)
    else:
        await CodeService.release_codes(db, order.id)
    db.add(order)
    await db.commit()
    clear_admin_order_cache()
    _clear_user_order_cache(order.user_id)
    await payment_events.publish(order.order_no, _order_status_event(order))
    return {"code": 200, "msg": "success", "data": await _order_payload(db, order, include_codes=False)}


@router.delete("/orders/{order_no}")
async def delete_my_order(
    order_no: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = int(current_user["sub"])
    result = await db.execute(
        select(Order).where(Order.order_no == order_no, Order.user_id == user_id).with_for_update()
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail={"code": 404, "msg": "订单不存在", "data": None})
    if order.user_deleted_at is None:
        order.user_deleted_at = datetime.now()
        db.add(order)
        await db.commit()
        clear_admin_order_cache()
        _clear_user_order_cache(user_id)
    return {"code": 200, "msg": "success", "data": {"order_no": order.order_no}}


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
    clear_admin_order_cache()
    _clear_user_order_cache(order.user_id)
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
                            clear_admin_order_cache()
                            _clear_user_order_cache(locked.user_id)
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
    cache_key = (after_id, after_created_at, page_size)
    cached = _get_cached_user_orders(user_id, cache_key)
    if cached is not None:
        return cached
    trace.mark("auth_dependency_done")

    await db.connection()
    trace.mark("db_connection_checkout")

    cursor_created_at = _parse_cursor_datetime(after_created_at)
    filters = [Order.user_id == user_id, Order.user_deleted_at.is_(None)]
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

    response = {
        "code": 200,
        "msg": "success",
        "data": data,
    }
    _set_cached_user_orders(user_id, cache_key, response)
    return response


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
