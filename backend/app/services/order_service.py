import logging
import random
from datetime import datetime
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.product import Product
from app.models.order import Order, OrderStatus
from app.services.code_service import CodeService, InsufficientStockError
from app.services.payment_service import PaymentService
from app.utils.haozpay_client import PaymentException

logger = logging.getLogger(__name__)


def generate_order_no() -> str:
    now = datetime.now()
    return f"KW{now.strftime('%Y%m%d%H%M%S')}{random.randint(1000, 9999)}"


class OrderService:
    def __init__(self, payment_service: PaymentService | None = None):
        self.payment_service = payment_service or PaymentService()

    async def create_order(
        self, db: AsyncSession, product_id: int, quantity: int,
        contact_info: str, pay_type: int = 0, user_id: int | None = None,
        notify_url: str = "", return_url: str | None = None,
    ) -> dict:
        stmt = select(Product).where(Product.id == product_id, Product.is_deleted == False)
        result = await db.execute(stmt)
        product = result.scalar_one_or_none()
        if not product:
            raise HTTPException(status_code=404, detail={"code": 404, "msg": "商品不存在", "data": None})

        available = await CodeService.count_available(db, product_id)
        if available < quantity:
            raise HTTPException(status_code=400, detail={
                "code": 400, "msg": f"库存不足，当前可用 {available} 张", "data": None})

        order_no = generate_order_no()
        total_amount = product.price * quantity

        order = Order(
            order_no=order_no, product_id=product_id,
            product_name=product.name, product_price=product.price,
            quantity=quantity, total_amount=total_amount,
            user_id=user_id, contact_info=contact_info,
            status=OrderStatus.PENDING,
        )
        db.add(order)
        await db.flush()

        try:
            await CodeService.reserve_codes(db, product_id, quantity, order.id)
        except InsufficientStockError as e:
            raise HTTPException(status_code=400, detail={"code": 400, "msg": e.message, "data": None})

        try:
            amount_cents = int(total_amount * 100)
            pay_info = await self.payment_service.create_payment(
                order_no=order_no, order_title=product.name,
                amount=amount_cents, pay_type=pay_type,
                notify_url=notify_url, return_url=return_url,
            )
            order.haozpay_seq_id = pay_info.haozpay_seq_id
        except PaymentException as e:
            await CodeService.release_codes(db, order.id)
            raise HTTPException(status_code=502, detail={
                "code": 502, "msg": f"支付网关调用失败: {e.message}", "data": None})

        return {
            "order_no": order_no, "total_amount": str(total_amount),
            "pay_info": {
                "pay_type": pay_info.pay_type,
                "html_form": pay_info.html_form,
                "qr_url": pay_info.qr_url,
                "qr_content": pay_info.qr_content,
                "haozpay_seq_id": pay_info.haozpay_seq_id,
            }
        }
