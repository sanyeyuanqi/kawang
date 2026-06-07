from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
import time

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select

from app.config import settings
from app.database import async_session_factory
from app.models.code_key import CODE_VALUE_MAX_LENGTH, CodeKey, CodeKeyStatus
from app.models.order import Order, OrderStatus
from app.models.product import Product
from app.services.code_service import CodeService
from app.utils.scheduler import cancel_expired_pending_orders


pytestmark = pytest.mark.anyio


async def test_admin_upload_image_uses_md5_filename_and_deduplicates(
    client: AsyncClient,
    admin_token: str,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    headers = {"Authorization": f"Bearer {admin_token}"}
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))
    content = b"\x89PNG\r\n\x1a\nsame-image-content"
    expected_md5 = "172f818503bc8580f9a442cf75e981fb"
    expected_filename = f"{expected_md5}.png"

    first_response = await client.post(
        "/admin/upload",
        files={"file": ("first.png", content, "image/png")},
        headers=headers,
    )
    second_response = await client.post(
        "/admin/upload",
        files={"file": ("second.png", content, "image/png")},
        headers=headers,
    )

    assert first_response.status_code == 200
    assert second_response.status_code == 200
    first_payload = first_response.json()["data"]
    second_payload = second_response.json()["data"]
    assert first_payload["filename"] == expected_filename
    assert second_payload["filename"] == expected_filename
    assert first_payload["url"] == second_payload["url"] == f"/static/{expected_filename}"
    assert first_payload["md5"] == second_payload["md5"] == expected_md5
    assert first_payload["duplicated"] is False
    assert second_payload["duplicated"] is True
    assert sorted(path.name for path in tmp_path.iterdir()) == [expected_filename]


async def test_admin_category_product_and_code_key_crud(client: AsyncClient, admin_token: str) -> None:
    headers = {"Authorization": f"Bearer {admin_token}"}
    suffix = time.time_ns()

    category_response = await client.post(
        "/admin/categories",
        json={"name": f"测试分类-{suffix}", "subtitle": "自动化测试", "sort_order": 1, "is_active": True},
        headers=headers,
    )
    assert category_response.status_code == 200
    category_id = category_response.json()["data"]["id"]

    update_category_response = await client.put(
        f"/admin/categories/{category_id}",
        json={"subtitle": "已更新"},
        headers=headers,
    )
    assert update_category_response.status_code == 200
    assert update_category_response.json()["data"]["subtitle"] == "已更新"

    product_response = await client.post(
        "/admin/products",
        json={
            "category_id": category_id,
            "name": f"测试商品-{suffix}",
            "description": "自动化测试商品",
            "price": "12.34",
            "sort_order": 1,
        },
        headers=headers,
    )
    assert product_response.status_code == 200
    product_id = product_response.json()["data"]["id"]

    update_product_response = await client.put(
        f"/admin/products/{product_id}",
        json={"price": "23.45"},
        headers=headers,
    )
    assert update_product_response.status_code == 200
    assert update_product_response.json()["data"]["price"] == "23.45"

    import_response = await client.post(
        "/admin/code-keys/import",
        json={"product_id": product_id, "codes": ["TEST-CODE-001", "TEST-CODE-002"]},
        headers=headers,
    )
    assert import_response.status_code == 200
    assert import_response.json()["data"]["imported_count"] == 2

    max_length_code = "A" * CODE_VALUE_MAX_LENGTH
    max_length_response = await client.post(
        "/admin/code-keys/import",
        json={"product_id": product_id, "codes": [max_length_code]},
        headers=headers,
    )
    assert max_length_response.status_code == 200
    assert max_length_response.json()["data"]["imported_count"] == 1

    over_length_response = await client.post(
        "/admin/code-keys/import",
        json={"product_id": product_id, "codes": ["B" * (CODE_VALUE_MAX_LENGTH + 1)]},
        headers=headers,
    )
    assert over_length_response.status_code == 400
    assert f"{CODE_VALUE_MAX_LENGTH} 个字符" in over_length_response.json()["msg"]

    codes_response = await client.get(f"/admin/code-keys/{product_id}/codes", headers=headers)
    assert codes_response.status_code == 200
    assert codes_response.json()["data"]["total"] == 3
    code_ids = [item["id"] for item in codes_response.json()["data"]["items"]]

    batch_delete_response = await client.request(
        "DELETE",
        "/admin/code-keys/codes/batch-delete",
        json={"ids": code_ids},
        headers=headers,
    )
    assert batch_delete_response.status_code == 200
    assert batch_delete_response.json()["data"]["deleted_count"] == 3

    codes_after_delete_response = await client.get(f"/admin/code-keys/{product_id}/codes", headers=headers)
    assert codes_after_delete_response.status_code == 200
    assert codes_after_delete_response.json()["data"]["total"] == 0

    delete_product_response = await client.delete(f"/admin/products/{product_id}", headers=headers)
    assert delete_product_response.status_code == 200

    delete_category_response = await client.delete(f"/admin/categories/{category_id}", headers=headers)
    assert delete_category_response.status_code == 200


async def test_admin_order_filter_and_export(client: AsyncClient, admin_token: str) -> None:
    headers = {"Authorization": f"Bearer {admin_token}"}

    list_response = await client.get("/admin/orders", params={"status": "paid", "limit": 5}, headers=headers)
    assert list_response.status_code == 200
    payload = list_response.json()
    assert "stats" in payload["data"]

    export_response = await client.get("/admin/orders/export", params={"status": "paid"}, headers=headers)
    assert export_response.status_code == 200
    assert export_response.content.startswith(b"\xef\xbb\xbf")
    assert b"order_no" in export_response.content


async def test_admin_announcement_crud_and_public_visibility(client: AsyncClient, admin_token: str) -> None:
    headers = {"Authorization": f"Bearer {admin_token}"}
    suffix = time.time_ns()
    title = f"自动化公告-{suffix}"

    create_response = await client.post(
        "/admin/announcements",
        json={
            "title": title,
            "tag": "自动化测试",
            "content": "用于验证公告发布、下线和删除流程。",
            "sort_order": 99,
            "is_published": True,
            "is_pinned": True,
        },
        headers=headers,
    )
    assert create_response.status_code == 200
    announcement_id = create_response.json()["data"]["id"]
    assert create_response.json()["data"]["is_pinned"] is True

    pinned_response = await client.get("/announcements/pinned")
    assert pinned_response.status_code == 200
    assert pinned_response.json()["data"]["id"] == announcement_id

    filtered_response = await client.get(
        "/admin/announcements",
        params={"q": title, "status": "published"},
        headers=headers,
    )
    assert filtered_response.status_code == 200
    filtered_payload = filtered_response.json()["data"]
    assert filtered_payload["total"] == 1
    assert filtered_payload["stats"]["published"] == 1
    assert filtered_payload["stats"]["draft"] == 0
    assert filtered_payload["items"][0]["id"] == announcement_id
    assert filtered_payload["items"][0]["is_pinned"] is True

    second_title = f"自动化置顶公告-{suffix}"
    second_create_response = await client.post(
        "/admin/announcements",
        json={
            "title": second_title,
            "tag": "置顶测试",
            "content": "用于验证同一时间只有一条首页置顶公告。",
            "sort_order": 98,
            "is_published": True,
            "is_pinned": True,
        },
        headers=headers,
    )
    assert second_create_response.status_code == 200
    second_announcement_id = second_create_response.json()["data"]["id"]

    pinned_after_second = await client.get("/announcements/pinned")
    assert pinned_after_second.status_code == 200
    assert pinned_after_second.json()["data"]["id"] == second_announcement_id

    first_after_second = await client.get(
        "/admin/announcements",
        params={"q": title, "status": "published"},
        headers=headers,
    )
    assert first_after_second.status_code == 200
    assert first_after_second.json()["data"]["items"][0]["is_pinned"] is False

    public_response = await client.get("/announcements")
    assert public_response.status_code == 200
    assert any(item["id"] == announcement_id for item in public_response.json()["data"])

    update_response = await client.put(
        f"/admin/announcements/{announcement_id}",
        json={"is_published": False, "title": f"{title}-已更新"},
        headers=headers,
    )
    assert update_response.status_code == 200
    assert update_response.json()["data"]["is_published"] is False
    assert update_response.json()["data"]["is_pinned"] is False
    assert update_response.json()["data"]["published_at"] is None

    draft_response = await client.get(
        "/admin/announcements",
        params={"q": f"{title}-已更新", "status": "draft"},
        headers=headers,
    )
    assert draft_response.status_code == 200
    draft_payload = draft_response.json()["data"]
    assert draft_payload["total"] == 1
    assert draft_payload["stats"]["published"] == 0
    assert draft_payload["stats"]["draft"] == 1
    assert draft_payload["items"][0]["id"] == announcement_id

    public_after_unpublish = await client.get("/announcements")
    assert all(item["id"] != announcement_id for item in public_after_unpublish.json()["data"])

    delete_response = await client.delete(f"/admin/announcements/{announcement_id}", headers=headers)
    assert delete_response.status_code == 200

    second_delete_response = await client.delete(f"/admin/announcements/{second_announcement_id}", headers=headers)
    assert second_delete_response.status_code == 200

    admin_list_response = await client.get("/admin/announcements", headers=headers)
    assert admin_list_response.status_code == 200
    assert all(item["id"] != announcement_id for item in admin_list_response.json()["data"]["items"])


async def test_scheduler_cancels_expired_pending_orders_and_releases_codes() -> None:
    async with async_session_factory() as db:
        database_now = await db.scalar(select(func.now()))
        assert database_now is not None
        product = (await db.execute(
            select(Product)
            .where(Product.is_deleted == False)
            .order_by(Product.id.asc())
            .limit(1)
        )).scalar_one()
        code = CodeKey(
            product_id=product.id,
            code_value=f"SCHEDULER-CODE-{time.time_ns()}",
            status=CodeKeyStatus.UNUSED,
        )
        db.add(code)
        order = Order(
            order_no=f"KWTIMER{time.time_ns()}",
            product_id=product.id,
            product_name=product.name,
            product_price=product.price,
            quantity=1,
            total_amount=Decimal(product.price),
            contact_info="timer@example.com",
            status=OrderStatus.PENDING,
            created_at=database_now - timedelta(minutes=16),
        )
        db.add(order)
        await db.flush()
        await CodeService.reserve_codes(db, product.id, 1, order.id)
        reserved_code = (await db.execute(select(CodeKey).where(CodeKey.order_id == order.id))).scalar_one()
        order_id = order.id
        order_no = order.order_no
        reserved_code_id = reserved_code.id
        await db.commit()

    await cancel_expired_pending_orders()

    async with async_session_factory() as db:
        order = (await db.execute(select(Order).where(Order.order_no == order_no))).scalar_one()
        reserved_codes = (await db.execute(
            select(CodeKey).where(CodeKey.order_id == order_id, CodeKey.status == CodeKeyStatus.RESERVED)
        )).scalars().all()
        released_code = (await db.execute(select(CodeKey).where(CodeKey.id == reserved_code_id))).scalar_one()

    assert order.status == OrderStatus.CANCELLED
    assert reserved_codes == []
    assert released_code.status == CodeKeyStatus.UNUSED
    assert released_code.order_id is None
