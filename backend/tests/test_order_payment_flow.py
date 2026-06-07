from __future__ import annotations

import time
import re
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.api.v1 import orders as buyer_orders_module
from app.api.v1.admin import orders as admin_orders_module
from app.config import settings
from app.database import async_session_factory
from app.models.category import Category
from app.models.code_key import CodeKey, CodeKeyStatus
from app.models.order import Order, OrderStatus
from app.models.product import Product
from app.models.user import User
from app.services.code_service import CodeService
from app.utils.redis import RedisKeys, redis_set
from app.utils.haozpay_client import HaoZPayClient, PayInfo, PaymentStatus, RefundResult
from app.utils.security import create_access_token, hash_password


pytestmark = pytest.mark.anyio


def _test_order_no(seed: str) -> str:
    return "KW" + seed[-22:].rjust(22, "0")


class FakePaymentService:
    def __init__(self, payment_status: PaymentStatus | None = None):
        self.payment_status = payment_status

    async def create_payment(
        self,
        order_no: str,
        order_title: str,
        amount: int,
        pay_type: int,
        notify_url: str,
        return_url: str | None = None,
    ) -> PayInfo:
        return PayInfo(
            pay_type=pay_type,
            qr_content=f"mock-pay://{order_no}",
            haozpay_seq_id=f"HZ-{order_no}",
        )

    async def query_payment(self, gateway_order_no: str) -> PaymentStatus:
        return self.payment_status or PaymentStatus(pay_status="1")


class FakeRefundService:
    def __init__(self):
        self.calls: list[tuple[str, int, str]] = []

    async def query_payment(self, gateway_order_no: str) -> PaymentStatus:
        return PaymentStatus(order_no=gateway_order_no, pay_status="2", pay_amount="1.00")

    async def process_refund(self, order_no: str, refund_amount: int, reason: str = "") -> RefundResult:
        self.calls.append((order_no, refund_amount, reason))
        return RefundResult(refund_seq_id=f"REFUND-{order_no}", refund_amount=str(refund_amount))


class NoQueryRefundService(FakeRefundService):
    async def query_payment(self, gateway_order_no: str) -> PaymentStatus:
        raise AssertionError("order detail should not query the payment gateway")


async def _product_with_stock(client: AsyncClient) -> dict:
    response = await client.get("/products", params={"offset": 0, "limit": 20})
    products = response.json()["data"]["items"]
    return next(item for item in products if item["available_stock"] > 0)


async def _paid_order(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> dict:
    monkeypatch.setattr(buyer_orders_module.order_service, "payment_service", FakePaymentService())

    async def valid_callback(params: dict) -> bool:
        return True

    monkeypatch.setattr(buyer_orders_module.haozpay_client, "verify_callback", valid_callback)

    suffix = str(time.time_ns())
    async with async_session_factory() as db:
        category = Category(name=f"支付测试分类-{suffix}", subtitle="支付测试", sort_order=1, is_active=True)
        db.add(category)
        await db.flush()
        product = Product(
            category_id=category.id,
            name=f"支付测试商品-{suffix}",
            description="支付流程隔离测试商品",
            usage_instructions="https://example.com/payment-flow",
            price=Decimal("1.00"),
            sort_order=1,
        )
        db.add(product)
        await db.flush()
        product_id = product.id
        db.add(CodeKey(
            product_id=product_id,
            code_value=f"PAYMENT-FLOW-{suffix}",
            status=CodeKeyStatus.UNUSED,
        ))
        await db.commit()

    sold_count_before = 0
    contact = f"pay-{time.time_ns()}@example.com"
    create_response = await client.post(
        "/orders",
        json={"product_id": product_id, "quantity": 1, "contact_info": contact, "pay_type": 1},
    )
    assert create_response.status_code == 200
    order = create_response.json()["data"]
    assert re.fullmatch(r"KW[A-Z0-9]{22}", order["order_no"])
    assert len(order["order_no"]) == 24

    callback_response = await client.post(
        "/orders/callback",
        json={
            "orderNo": order["order_no"],
            "payStatus": "2",
            "payAmount": order["total_amount"],
            "merchantNo": settings.HAOZPAY_MERCHANT_NO,
            "payType": "wechat",
        },
    )
    assert callback_response.status_code == 200
    assert callback_response.text == "success"
    order["_product_id"] = product_id
    order["_sold_count_before"] = sold_count_before
    return order


async def test_create_order_callback_and_duplicate_callback(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    order = await _paid_order(client, monkeypatch)

    product_response = await client.get(f"/products/{order['_product_id']}")
    assert product_response.json()["data"]["sold_count"] == order["_sold_count_before"] + 1

    result_response = await client.get(f"/orders/{order['order_no']}/result")
    result_payload = result_response.json()
    assert result_response.status_code == 200
    assert result_payload["data"]["status"] == "paid"
    assert result_payload["data"]["usage_instructions"] == "https://example.com/payment-flow"
    assert len(result_payload["data"]["codes"]) == 1

    duplicate_response = await client.post(
        "/orders/callback",
        json={
            "orderNo": order["order_no"],
            "payStatus": "2",
            "payAmount": order["total_amount"],
            "merchantNo": settings.HAOZPAY_MERCHANT_NO,
        },
    )
    assert duplicate_response.text == "success"

    duplicate_product_response = await client.get(f"/products/{order['_product_id']}")
    assert duplicate_product_response.json()["data"]["sold_count"] == order["_sold_count_before"] + 1


async def test_result_query_confirms_paid_order_when_callback_is_missing(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "HAOZPAY_QUERY_ENABLED", True)
    monkeypatch.setattr(
        buyer_orders_module.order_service,
        "payment_service",
        FakePaymentService(),
    )
    monkeypatch.setattr(
        buyer_orders_module,
        "payment_service",
        FakePaymentService(PaymentStatus(pay_status="2", pay_amount="1.00", pay_channel="WECHAT_JSAPI")),
    )

    suffix = str(time.time_ns())
    async with async_session_factory() as db:
        category = Category(name=f"补单测试分类-{suffix}", subtitle="补单", sort_order=1, is_active=True)
        db.add(category)
        await db.flush()
        product = Product(
            category_id=category.id,
            name=f"补单测试商品-{suffix}",
            description="回调丢失时主动查单",
            price=Decimal("1.00"),
            sort_order=1,
        )
        db.add(product)
        await db.flush()
        db.add(CodeKey(
            product_id=product.id,
            code_value=f"QUERY-PAID-{suffix}",
            status=CodeKeyStatus.UNUSED,
        ))
        await db.commit()
        product_id = product.id

    create_response = await client.post(
        "/orders",
        json={
            "product_id": product_id,
            "quantity": 1,
            "contact_info": f"query-paid-{suffix}@example.com",
            "pay_type": 1,
        },
    )
    assert create_response.status_code == 200
    created = create_response.json()["data"]
    assert created["status"] == "pending"

    result_response = await client.get(f"/orders/{created['order_no']}/result")
    payload = result_response.json()

    assert result_response.status_code == 200
    assert payload["data"]["status"] == "paid"
    assert len(payload["data"]["codes"]) == 1
    assert payload["data"]["codes"][0]["code_value"] == f"QUERY-PAID-{suffix}"

    async with async_session_factory() as db:
        sold_count = await db.scalar(select(Product.sold_count).where(Product.id == product_id))
        assert sold_count == 1


async def test_pending_order_can_fetch_pay_info_again(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(buyer_orders_module.order_service, "payment_service", FakePaymentService())

    suffix = str(time.time_ns())
    async with async_session_factory() as db:
        category = Category(name=f"待支付二维码分类-{suffix}", subtitle="待支付", sort_order=1, is_active=True)
        db.add(category)
        await db.flush()
        product = Product(
            category_id=category.id,
            name=f"待支付二维码商品-{suffix}",
            description="查询页重新拉起支付",
            price=Decimal("1.00"),
            sort_order=1,
        )
        db.add(product)
        await db.flush()
        db.add(CodeKey(
            product_id=product.id,
            code_value=f"PENDING-PAY-{suffix}",
            status=CodeKeyStatus.UNUSED,
        ))
        await db.commit()
        product_id = product.id

    create_response = await client.post(
        "/orders",
        json={
            "product_id": product_id,
            "quantity": 1,
            "contact_info": f"pending-pay-{suffix}@example.com",
            "pay_type": 1,
        },
    )
    assert create_response.status_code == 200
    created = create_response.json()["data"]
    assert created["status"] == "pending"

    pay_info_response = await client.get(f"/orders/{created['order_no']}/pay-info")
    pay_info_payload = pay_info_response.json()

    assert pay_info_response.status_code == 200
    assert pay_info_payload["data"]["qr_content"] == f"mock-pay://{created['order_no']}"
    assert pay_info_payload["data"]["haozpay_seq_id"] == f"HZ-{created['order_no']}"


async def test_pending_order_can_be_cancelled_and_releases_stock(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(buyer_orders_module.order_service, "payment_service", FakePaymentService())

    suffix = str(time.time_ns())
    contact = f"cancel-order-{suffix}@example.com"
    async with async_session_factory() as db:
        category = Category(name=f"手动取消分类-{suffix}", subtitle="手动取消", sort_order=1, is_active=True)
        db.add(category)
        await db.flush()
        product = Product(
            category_id=category.id,
            name=f"手动取消商品-{suffix}",
            description="订单查询页取消订单",
            price=Decimal("1.00"),
            sort_order=1,
        )
        db.add(product)
        await db.flush()
        db.add(CodeKey(
            product_id=product.id,
            code_value=f"MANUAL-CANCEL-{suffix}",
            status=CodeKeyStatus.UNUSED,
        ))
        await db.commit()
        product_id = product.id

    create_response = await client.post(
        "/orders",
        json={"product_id": product_id, "quantity": 1, "contact_info": contact, "pay_type": 1},
    )
    assert create_response.status_code == 200
    created = create_response.json()["data"]

    wrong_response = await client.post(
        f"/orders/{created['order_no']}/cancel",
        json={"contact_info": "someone-else"},
    )
    assert wrong_response.status_code == 403

    cancel_response = await client.post(
        f"/orders/{created['order_no']}/cancel",
        json={"contact_info": contact},
    )
    payload = cancel_response.json()
    assert cancel_response.status_code == 200
    assert payload["data"]["status"] == "cancelled"

    async with async_session_factory() as db:
        order = await db.scalar(select(Order).where(Order.order_no == created["order_no"]))
        code = await db.scalar(select(CodeKey).where(CodeKey.product_id == product_id))
        assert order is not None
        assert order.status == OrderStatus.CANCELLED
        assert order.cancelled_at is not None
        assert code is not None
        assert code.status == CodeKeyStatus.UNUSED
        assert code.order_id is None

    pay_info_response = await client.get(f"/orders/{created['order_no']}/pay-info")
    assert pay_info_response.status_code == 400


async def test_paid_callback_recovers_cancelled_order_when_stock_is_available(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(buyer_orders_module.order_service, "payment_service", FakePaymentService())

    async def valid_callback(params: dict) -> bool:
        return True

    monkeypatch.setattr(buyer_orders_module.haozpay_client, "verify_callback", valid_callback)

    suffix = str(time.time_ns())
    async with async_session_factory() as db:
        category = Category(name=f"取消恢复分类-{suffix}", subtitle="回调恢复", sort_order=1, is_active=True)
        db.add(category)
        await db.flush()
        product = Product(
            category_id=category.id,
            name=f"取消恢复商品-{suffix}",
            description="取消后收到回调",
            price=Decimal("1.00"),
            sort_order=1,
        )
        db.add(product)
        await db.flush()
        db.add(CodeKey(
            product_id=product.id,
            code_value=f"CANCELLED-CALLBACK-{suffix}",
            status=CodeKeyStatus.UNUSED,
        ))
        await db.commit()
        product_id = product.id

    create_response = await client.post(
        "/orders",
        json={
            "product_id": product_id,
            "quantity": 1,
            "contact_info": f"cancelled-callback-{suffix}@example.com",
            "pay_type": 1,
        },
    )
    assert create_response.status_code == 200
    created = create_response.json()["data"]

    async with async_session_factory() as db:
        order = await db.scalar(select(Order).where(Order.order_no == created["order_no"]))
        assert order is not None
        await CodeService.release_codes(db, order.id)
        order.status = OrderStatus.CANCELLED
        await db.commit()

    callback_response = await client.post(
        "/orders/callback",
        json={
            "orderNo": created["pay_info"]["haozpay_seq_id"],
            "payStatus": "2",
            "payAmount": created["total_amount"],
            "merchantNo": settings.HAOZPAY_MERCHANT_NO,
            "payType": "wechat",
        },
    )
    assert callback_response.status_code == 200
    assert callback_response.text == "success"

    result_response = await client.get(f"/orders/{created['order_no']}/result")
    payload = result_response.json()
    assert payload["data"]["status"] == "paid"
    assert len(payload["data"]["codes"]) == 1
    assert payload["data"]["codes"][0]["code_value"] == f"CANCELLED-CALLBACK-{suffix}"

    async with async_session_factory() as db:
        sold_count = await db.scalar(select(Product.sold_count).where(Product.id == product_id))
        assert sold_count == 1


async def test_auto_paid_order_increments_sold_count(client: AsyncClient) -> None:
    suffix = str(time.time_ns())
    async with async_session_factory() as db:
        category = Category(name=f"自动支付分类-{suffix}", subtitle="自动支付", sort_order=1, is_active=True)
        db.add(category)
        await db.flush()
        product = Product(
            category_id=category.id,
            name=f"自动支付商品-{suffix}",
            description="低金额自动支付",
            price=Decimal("0.01"),
            sort_order=1,
        )
        db.add(product)
        await db.flush()
        product_id = product.id
        db.add(CodeKey(
            product_id=product_id,
            code_value=f"AUTO-PAID-{suffix}",
            status=CodeKeyStatus.UNUSED,
        ))
        await db.commit()

    create_response = await client.post(
        "/orders",
        json={
            "product_id": product_id,
            "quantity": 1,
            "contact_info": f"auto-paid-{suffix}@example.com",
            "pay_type": 1,
        },
    )
    assert create_response.status_code == 200
    assert create_response.json()["data"]["status"] == "paid"

    async with async_session_factory() as db:
        sold_count = await db.scalar(select(Product.sold_count).where(Product.id == product_id))
        assert sold_count == 1


async def test_preorder_uses_custom_stock_and_manual_delivery(
    client: AsyncClient,
    admin_token: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    headers = {"Authorization": f"Bearer {admin_token}"}
    monkeypatch.setattr(buyer_orders_module.order_service, "payment_service", FakePaymentService())

    async def valid_callback(params: dict) -> bool:
        return True

    monkeypatch.setattr(buyer_orders_module.haozpay_client, "verify_callback", valid_callback)

    suffix = time.time_ns()
    product_response = await client.post(
        "/admin/products",
        json={
            "name": f"提前抢购商品-{suffix}",
            "description": "提前抢购无需绑定卡密",
            "price": "3.00",
            "product_type": "preorder",
            "preorder_stock": 3,
            "sort_order": 1,
        },
        headers=headers,
    )
    assert product_response.status_code == 200
    product = product_response.json()["data"]
    assert product["product_type"] == "preorder"
    assert product["available_stock"] == 3

    create_response = await client.post(
        "/orders",
        json={
            "product_id": product["id"],
            "quantity": 2,
            "contact_info": f"preorder-{suffix}@example.com",
            "pay_type": 1,
        },
    )
    assert create_response.status_code == 200
    order_payload = create_response.json()["data"]

    detail_after_create = await client.get(f"/products/{product['id']}")
    assert detail_after_create.status_code == 200
    assert detail_after_create.json()["data"]["available_stock"] == 1

    callback_response = await client.post(
        "/orders/callback",
        json={
            "orderNo": order_payload["order_no"],
            "payStatus": "2",
            "payAmount": order_payload["total_amount"],
            "merchantNo": settings.HAOZPAY_MERCHANT_NO,
            "payType": "wechat",
        },
    )
    assert callback_response.status_code == 200
    assert callback_response.text == "success"

    admin_list = await client.get("/admin/orders", params={"q": order_payload["order_no"]}, headers=headers)
    assert admin_list.status_code == 200
    admin_order = admin_list.json()["data"]["items"][0]
    assert admin_order["status"] == OrderStatus.PAID.value
    assert admin_order["product_type"] == "preorder"

    detail_response = await client.get(f"/admin/orders/{admin_order['id']}", headers=headers)
    assert detail_response.status_code == 200
    detail = detail_response.json()["data"]
    assert detail["codes"] == []

    delivery_info = "兑换链接：https://example.com/redeem\n兑换码：PREORDER-DELIVERED"
    deliver_response = await client.post(
        f"/admin/orders/{admin_order['id']}/deliver",
        json={"delivery_info": delivery_info},
        headers=headers,
    )
    assert deliver_response.status_code == 200
    delivered = deliver_response.json()["data"]
    assert delivered["status"] == OrderStatus.DELIVERED.value
    assert delivered["delivered_at"]
    assert delivered["delivery_info"] == delivery_info

    result_response = await client.get(f"/orders/{order_payload['order_no']}/result")
    assert result_response.status_code == 200
    result = result_response.json()["data"]
    assert result["status"] == OrderStatus.DELIVERED.value
    assert result["delivery_info"] == delivery_info

    refund_service = FakeRefundService()
    monkeypatch.setattr(admin_orders_module, "PaymentService", lambda: refund_service)
    refund_without_force = await client.post(f"/admin/orders/{admin_order['id']}/refund", json={}, headers=headers)
    assert refund_without_force.status_code == 400
    assert "强制退款" in refund_without_force.json()["msg"]

    refund_response = await client.post(f"/admin/orders/{admin_order['id']}/refund", json={"force": True}, headers=headers)
    assert refund_response.status_code == 200
    refunded = refund_response.json()["data"]
    assert refunded["status"] == OrderStatus.REFUNDED.value
    assert refund_service.calls[0][0] == f"HZ-{order_payload['order_no']}"
    assert refunded["refund_seq_id"] == f"REFUND-HZ-{order_payload['order_no']}"


async def test_callback_rejects_invalid_signature(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    async def invalid_callback(params: dict) -> bool:
        return False

    monkeypatch.setattr(buyer_orders_module.haozpay_client, "verify_callback", invalid_callback)

    response = await client.post("/orders/callback", json={"orderNo": f"KW-BAD-{time.time_ns()}"})

    assert response.status_code == 200
    assert response.text == "fail"


async def test_create_order_rejects_insufficient_stock(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(buyer_orders_module.order_service, "payment_service", FakePaymentService())
    suffix = str(time.time_ns())
    async with async_session_factory() as db:
        category = Category(name=f"库存不足分类-{suffix}", subtitle="库存不足", sort_order=1, is_active=True)
        db.add(category)
        await db.flush()
        product = Product(
            category_id=category.id,
            name=f"库存不足商品-{suffix}",
            description="库存不足隔离测试商品",
            price=Decimal("1.00"),
            sort_order=1,
        )
        db.add(product)
        await db.flush()
        product_id = product.id
        db.add(CodeKey(
            product_id=product_id,
            code_value=f"INSUFFICIENT-STOCK-{suffix}",
            status=CodeKeyStatus.UNUSED,
        ))
        await db.commit()

    response = await client.post(
        "/orders",
        json={
            "product_id": product_id,
            "quantity": 2,
            "contact_info": f"stock-{time.time_ns()}@example.com",
            "pay_type": 1,
        },
    )

    assert response.status_code == 400


async def test_second_order_cannot_take_reserved_stock(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(buyer_orders_module.order_service, "payment_service", FakePaymentService())
    suffix = str(time.time_ns())

    async with async_session_factory() as db:
        category = Category(name=f"并发测试分类-{suffix}", subtitle="库存抢购", sort_order=1, is_active=True)
        db.add(category)
        await db.flush()
        product = Product(
            category_id=category.id,
            name=f"并发库存商品-{suffix}",
            description="只有四张卡密",
            price=Decimal("1.00"),
            sort_order=1,
        )
        db.add(product)
        await db.flush()
        product_id = product.id
        for index in range(4):
            db.add(CodeKey(
                product_id=product_id,
                code_value=f"CONCURRENT-{suffix}-{index}",
                status=CodeKeyStatus.UNUSED,
            ))
        await db.commit()

    first_response = await client.post(
        "/orders",
        json={
            "product_id": product_id,
            "quantity": 4,
            "contact_info": f"first-{suffix}@example.com",
            "pay_type": 1,
        },
    )
    assert first_response.status_code == 200

    second_response = await client.post(
        "/orders",
        json={
            "product_id": product_id,
            "quantity": 4,
            "contact_info": f"second-{suffix}@example.com",
            "pay_type": 1,
        },
    )
    payload = second_response.json()
    assert second_response.status_code == 400
    assert "库存不足" in payload["detail"]["msg"]


async def test_my_orders_uses_cursor_pagination(client: AsyncClient) -> None:
    suffix = str(time.time_ns())
    email = f"cursor-{suffix}@example.com"

    async with async_session_factory() as db:
        user = User(
            username=f"cursor-{suffix}",
            email=email,
            password_hash=hash_password("cursor-password"),
            role="buyer",
        )
        db.add(user)
        await db.flush()
        user_id = user.id
        for index in range(12):
            db.add(Order(
                order_no=_test_order_no(f"CURSOR{suffix}{index:02d}"),
                product_id=1000 + index,
                product_name="视频会员月卡",
                product_price=Decimal("1.00"),
                quantity=1,
                total_amount=Decimal("1.00"),
                user_id=user_id,
                contact_info=email,
                status=OrderStatus.PAID,
            ))
        await db.commit()

    token = create_access_token(user_id, "buyer")
    await redis_set(RedisKeys.auth_token(user_id), token)
    headers = {"Authorization": f"Bearer {token}"}

    first_response = await client.get("/orders/mine", params={"contact_info": email, "limit": 50}, headers=headers)
    assert first_response.status_code == 200
    first_page = first_response.json()["data"]
    assert len(first_page["records"]) == 10
    assert len(first_page["items"]) == 10
    assert first_page["count"] == 10
    assert first_page["limit"] == 10
    assert first_page["prev_cursor"] == first_page["records"][0]["id"]
    assert first_page["next_cursor"] == first_page["records"][-1]["id"]
    assert first_page["before_cursor"] == first_page["prev_cursor"]
    assert first_page["after_cursor"] == first_page["next_cursor"]
    assert first_page["next_cursor_created_at"] == first_page["records"][-1]["created_at"]
    assert first_page["has_more"] is True
    assert all(not item["codes"] for item in first_page["records"])
    first_ids = [item["id"] for item in first_page["records"]]
    assert first_ids == sorted(first_ids, reverse=True)

    second_response = await client.get(
        "/orders/mine",
        params={"contact_info": email, "after_id": first_page["next_cursor"], "after_created_at": first_page["next_cursor_created_at"], "limit": 50},
        headers=headers,
    )
    assert second_response.status_code == 200
    second_page = second_response.json()["data"]
    assert len(second_page["records"]) == 2
    assert second_page["has_more"] is False
    second_ids = [item["id"] for item in second_page["records"]]
    assert second_ids == sorted(second_ids, reverse=True)
    assert max(second_ids) < min(first_ids)


async def test_user_can_hide_order_without_removing_admin_visibility(client: AsyncClient, admin_token: str) -> None:
    suffix = str(time.time_ns())
    email = f"hide-order-{suffix}@example.com"

    async with async_session_factory() as db:
        user = User(
            username=f"hide-order-{suffix}",
            email=email,
            password_hash=hash_password("hide-order-password"),
            role="buyer",
        )
        db.add(user)
        await db.flush()
        user_id = user.id
        order = Order(
            order_no=_test_order_no(f"HIDE{suffix}"),
            product_id=2000,
            product_name="隐藏测试商品",
            product_price=Decimal("1.00"),
            quantity=1,
            total_amount=Decimal("1.00"),
            user_id=user_id,
            contact_info=email,
            status=OrderStatus.PENDING,
        )
        db.add(order)
        await db.commit()
        order_no = order.order_no

    token = create_access_token(user_id, "buyer")
    await redis_set(RedisKeys.auth_token(user_id), token)
    headers = {"Authorization": f"Bearer {token}"}

    first_response = await client.get("/orders/mine", headers=headers)
    assert first_response.status_code == 200
    assert any(item["order_no"] == order_no for item in first_response.json()["data"]["items"])

    delete_response = await client.delete(f"/orders/{order_no}", headers=headers)
    assert delete_response.status_code == 200

    second_response = await client.get("/orders/mine", headers=headers)
    assert second_response.status_code == 200
    assert all(item["order_no"] != order_no for item in second_response.json()["data"]["items"])

    admin_response = await client.get("/admin/orders", params={"q": order_no}, headers={"Authorization": f"Bearer {admin_token}"})
    assert admin_response.status_code == 200
    assert admin_response.json()["data"]["items"][0]["order_no"] == order_no


async def test_admin_refund_revokes_assigned_codes(client: AsyncClient, admin_token: str, monkeypatch: pytest.MonkeyPatch) -> None:
    order = await _paid_order(client, monkeypatch)
    refund_service = FakeRefundService()
    monkeypatch.setattr(admin_orders_module, "PaymentService", lambda: refund_service)

    headers = {"Authorization": f"Bearer {admin_token}"}
    list_response = await client.get("/admin/orders", params={"q": order["order_no"]}, headers=headers)
    order_id = list_response.json()["data"]["items"][0]["id"]
    detail_response = await client.get(f"/admin/orders/{order_id}", headers=headers)
    assert detail_response.status_code == 200
    assert detail_response.json()["data"]["refund_available"] is True

    refund_without_force = await client.post(f"/admin/orders/{order_id}/refund", json={}, headers=headers)
    assert refund_without_force.status_code == 400
    assert "强制退款" in refund_without_force.json()["msg"]

    refund_response = await client.post(f"/admin/orders/{order_id}/refund", json={"force": True}, headers=headers)

    assert refund_response.status_code == 200
    refund_payload = refund_response.json()["data"]
    assert refund_payload["status"] == "refunded"
    assert refund_service.calls[0][0] == f"HZ-{order['order_no']}"
    assert refund_payload["refund_seq_id"] == f"REFUND-HZ-{order['order_no']}"


async def test_admin_order_detail_does_not_query_gateway_for_refund_availability(
    client: AsyncClient,
    admin_token: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    order = await _paid_order(client, monkeypatch)
    monkeypatch.setattr(admin_orders_module, "PaymentService", lambda: NoQueryRefundService())

    headers = {"Authorization": f"Bearer {admin_token}"}
    list_response = await client.get("/admin/orders", params={"q": order["order_no"]}, headers=headers)
    assert list_response.status_code == 200
    order_id = list_response.json()["data"]["items"][0]["id"]

    detail_response = await client.get(f"/admin/orders/{order_id}", headers=headers)

    assert detail_response.status_code == 200
    assert detail_response.json()["data"]["refund_available"] is True


async def test_haozpay_client_uses_gateway_seq_for_payment_and_refund(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[str, dict]] = []
    client = HaoZPayClient(merchant_no="M", private_key="PK", platform_public_key="PUB", debug=True)

    async def fake_request(method: str, path: str, params: dict) -> dict:
        calls.append((path, params))
        if path.endswith("/order"):
            return {"code": 0, "data": {"payInfo": "mock-pay", "seqId": "HZHT202606070001", "merchantOrderNo": "KWLOCAL"}}
        if path.endswith("/refund"):
            return {"code": 0, "data": {"seqId": "HZRF202606070001", "refundAmount": "0.02"}}
        raise AssertionError(path)

    monkeypatch.setattr(client, "_request", fake_request)

    pay_info = await client.create_order("测试商品", 2, 1, "https://example.com/notify", out_trade_no="KWLOCAL")
    refund = await client.create_refund(pay_info.haozpay_seq_id or "", 2, "后台退款")

    assert pay_info.haozpay_seq_id == "HZHT202606070001"
    assert calls[1][1]["orderNo"] == "HZHT202606070001"
    assert calls[1][1]["refundAmount"] == 0.02
    assert refund.refund_seq_id == "HZRF202606070001"
