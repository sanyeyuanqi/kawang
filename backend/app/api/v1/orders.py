import logging
import json
from datetime import datetime
from decimal import Decimal
from fastapi import APIRouter, Depends, Request, HTTPException
from fastapi.responses import PlainTextResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.schemas.order import OrderCreateRequest
from app.services.order_service import OrderService
from app.services.code_service import CodeService
from app.utils.haozpay_client import haozpay_client
from app.models.order import Order, OrderStatus
from app.models.code_key import CodeKey, CodeKeyStatus
from app.config import settings
from app.api.deps import get_current_user_optional

logger = logging.getLogger(__name__)
router = APIRouter()
order_service = OrderService()


def _status_value(status) -> str:
    return status.value if hasattr(status, "value") else str(status)


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

    if order.status != OrderStatus.PENDING:
        return PlainTextResponse("success")

    pay_status = str(params.get("payStatus") or params.get("PayStatus") or "")
    if pay_status != "2":
        logger.info(f"[callback] {order_no} ignored payStatus={pay_status}")
        return PlainTextResponse("success")

    pay_amount = params.get("payAmount") or params.get("PayAmount")
    if pay_amount is not None and Decimal(str(pay_amount)) != order.total_amount:
        logger.warning(f"[callback] amount mismatch for {order_no}: {pay_amount} != {order.total_amount}")
        return PlainTextResponse("fail")

    now = datetime.now()
    order.status = OrderStatus.PAID
    order.paid_at = now
    order.pay_channel = params.get("payChannel") or params.get("payType") or params.get("PayType") or ""
    db.add(order)

    confirmed = await CodeService.confirm_codes(db, order.id)
    logger.info(f"[callback] {order_no} paid, confirmed {confirmed} codes")
    await db.commit()

    return PlainTextResponse("success")


@router.get("/orders/{order_no}/result")
async def get_order_result(order_no: str, db: AsyncSession = Depends(get_db)):
    stmt = select(Order).where(Order.order_no == order_no)
    result = await db.execute(stmt)
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail={"code": 404, "msg": "订单不存在", "data": None})

    codes = []
    if order.status == OrderStatus.PAID:
        code_stmt = select(CodeKey).where(CodeKey.order_id == order.id, CodeKey.status == CodeKeyStatus.ASSIGNED)
        code_result = await db.execute(code_stmt)
        codes = [{"id": c.id, "code_value": c.code_value} for c in code_result.scalars().all()]

    return {"code": 200, "msg": "success", "data": {
        "order_no": order.order_no, "status": _status_value(order.status), "total_amount": str(order.total_amount),
        "product_name": order.product_name, "quantity": order.quantity, "contact_info": order.contact_info,
        "codes": codes,
        "paid_at": order.paid_at.strftime("%Y-%m-%d %H:%M:%S") if order.paid_at else None,
        "created_at": order.created_at.strftime("%Y-%m-%d %H:%M:%S") if order.created_at else None,
    }}


@router.get("/orders/mine")
async def get_my_orders(current_user: dict = Depends(get_current_user_optional), db: AsyncSession = Depends(get_db)):
    if current_user is None:
        raise HTTPException(status_code=401, detail={"code": 401, "msg": "未登录", "data": None})
    stmt = select(Order).where(Order.user_id == int(current_user["sub"])).order_by(Order.created_at.desc())
    orders = (await db.execute(stmt)).scalars().all()
    return {"code": 200, "msg": "success", "data": [
        {
            "order_no": order.order_no,
            "status": _status_value(order.status),
            "total_amount": str(order.total_amount),
            "product_name": order.product_name,
            "quantity": order.quantity,
            "contact_info": order.contact_info,
            "paid_at": order.paid_at.strftime("%Y-%m-%d %H:%M:%S") if order.paid_at else None,
            "created_at": order.created_at.strftime("%Y-%m-%d %H:%M:%S") if order.created_at else None,
        }
        for order in orders
    ]}


@router.post("/orders/query")
async def query_orders(request: Request, db: AsyncSession = Depends(get_db)):
    body = await request.json()
    contact_info = body.get("contact_info", "")
    offset = max(int(body.get("offset", 0) or 0), 0)
    limit = min(max(int(body.get("limit", 10) or 10), 1), 50)
    if not contact_info:
        return {"code": 400, "msg": "请输入联系方式", "data": None}

    filters = Order.contact_info == contact_info
    total = await db.scalar(select(func.count()).select_from(Order).where(filters))
    stmt = select(Order).where(filters).order_by(Order.created_at.desc()).offset(offset).limit(limit)
    result = await db.execute(stmt)
    orders = result.scalars().all()

    items = []
    for order in orders:
        codes = []
        if order.status == OrderStatus.PAID:
            code_stmt = select(CodeKey).where(CodeKey.order_id == order.id, CodeKey.status == CodeKeyStatus.ASSIGNED)
            codes = [{"id": c.id, "code_value": c.code_value} for c in (await db.execute(code_stmt)).scalars().all()]
        items.append({
            "order_no": order.order_no, "status": _status_value(order.status), "total_amount": str(order.total_amount),
            "product_name": order.product_name, "quantity": order.quantity, "contact_info": order.contact_info,
            "codes": codes,
            "paid_at": order.paid_at.strftime("%Y-%m-%d %H:%M:%S") if order.paid_at else None,
            "created_at": order.created_at.strftime("%Y-%m-%d %H:%M:%S") if order.created_at else None,
        })

    return {"code": 200, "msg": "success", "data": {"items": items, "total": total or 0, "offset": offset, "limit": limit}}
