from __future__ import annotations

import time
from decimal import Decimal

import pytest
from httpx import AsyncClient

from app.api.v1 import orders as buyer_orders_module
from app.api.v1.admin import orders as admin_orders_module
from app.config import settings
from app.database import async_session_factory
from app.models.category import Category
from app.models.code_key import CodeKey, CodeKeyStatus
from app.models.product import Product
from app.utils.haozpay_client import PayInfo, RefundResult


pytestmark = pytest.mark.anyio


class FakePaymentService:
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


class FakeRefundService:
    async def process_refund(self, order_no: str, refund_amount: int, reason: str = "") -> RefundResult:
        return RefundResult(refund_seq_id=f"REFUND-{order_no}", refund_amount=str(refund_amount))


async def _product_with_stock(client: AsyncClient) -> dict:
    response = await client.get("/products", params={"offset": 0, "limit": 20})
    products = response.json()["data"]["items"]
    return next(item for item in products if item["available_stock"] > 0)


async def _paid_order(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> dict:
    monkeypatch.setattr(buyer_orders_module.order_service, "payment_service", FakePaymentService())

    async def valid_callback(params: dict) -> bool:
        return True

    monkeypatch.setattr(buyer_orders_module.haozpay_client, "verify_callback", valid_callback)

    product = await _product_with_stock(client)
    contact = f"pay-{time.time_ns()}@example.com"
    create_response = await client.post(
        "/orders",
        json={"product_id": product["id"], "quantity": 1, "contact_info": contact, "pay_type": 1},
    )
    assert create_response.status_code == 200
    order = create_response.json()["data"]

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
    return order


async def test_create_order_callback_and_duplicate_callback(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    order = await _paid_order(client, monkeypatch)

    result_response = await client.get(f"/orders/{order['order_no']}/result")
    result_payload = result_response.json()
    assert result_response.status_code == 200
    assert result_payload["data"]["status"] == "paid"
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


async def test_callback_rejects_invalid_signature(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    async def invalid_callback(params: dict) -> bool:
        return False

    monkeypatch.setattr(buyer_orders_module.haozpay_client, "verify_callback", invalid_callback)

    response = await client.post("/orders/callback", json={"orderNo": f"KW-BAD-{time.time_ns()}"})

    assert response.status_code == 200
    assert response.text == "fail"


async def test_create_order_rejects_insufficient_stock(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(buyer_orders_module.order_service, "payment_service", FakePaymentService())
    product = await _product_with_stock(client)

    response = await client.post(
        "/orders",
        json={
            "product_id": product["id"],
            "quantity": min(product["available_stock"] + 1, 100),
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


async def test_admin_refund_revokes_assigned_codes(client: AsyncClient, admin_token: str, monkeypatch: pytest.MonkeyPatch) -> None:
    order = await _paid_order(client, monkeypatch)
    monkeypatch.setattr(admin_orders_module, "PaymentService", lambda: FakeRefundService())

    headers = {"Authorization": f"Bearer {admin_token}"}
    list_response = await client.get("/admin/orders", params={"q": order["order_no"]}, headers=headers)
    order_id = list_response.json()["data"]["items"][0]["id"]
    refund_response = await client.post(f"/admin/orders/{order_id}/refund", json={}, headers=headers)

    assert refund_response.status_code == 200
    refund_payload = refund_response.json()["data"]
    assert refund_payload["status"] == "refunded"
    assert refund_payload["refund_seq_id"] == f"REFUND-{order['order_no']}"
