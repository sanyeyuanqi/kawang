from __future__ import annotations

import pytest
from httpx import AsyncClient


pytestmark = pytest.mark.anyio


async def test_categories_list_returns_active_seeded_categories(client: AsyncClient) -> None:
    response = await client.get("/categories")

    assert response.status_code == 200
    payload = response.json()
    assert payload["code"] == 200
    assert len(payload["data"]) >= 6
    assert {"id", "name", "subtitle", "sort_order", "is_active"} <= set(payload["data"][0].keys())


async def test_products_list_supports_pagination_and_search(client: AsyncClient) -> None:
    response = await client.get("/products", params={"offset": 0, "limit": 2})

    assert response.status_code == 200
    payload = response.json()
    assert payload["code"] == 200
    assert payload["data"]["total"] >= 4
    assert len(payload["data"]["items"]) == 2
    assert {"id", "name", "price", "available_stock", "is_on_sale"} <= set(payload["data"]["items"][0].keys())

    search_response = await client.get("/products", params={"q": "视频"})
    search_payload = search_response.json()
    assert search_response.status_code == 200
    assert search_payload["data"]["total"] >= 1
    assert any("视频" in item["name"] for item in search_payload["data"]["items"])


async def test_product_detail_and_missing_product(client: AsyncClient) -> None:
    list_response = await client.get("/products", params={"q": "视频", "limit": 1})
    product = list_response.json()["data"]["items"][0]

    detail_response = await client.get(f"/products/{product['id']}")
    detail_payload = detail_response.json()
    assert detail_response.status_code == 200
    assert detail_payload["code"] == 200
    assert detail_payload["data"]["id"] == product["id"]
    assert "category_name" in detail_payload["data"]

    missing_response = await client.get("/products/99999999")
    assert missing_response.status_code == 404
