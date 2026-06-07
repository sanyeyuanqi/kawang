import asyncio

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.services.catalog_cache import (
    PUBLIC_CATALOG_TTL_SECONDS,
    cache_get_hash_json,
    cache_get_json,
    cache_set_hash_many_json,
    cache_set_json,
)
from app.utils.redis import RedisKeys
from app.models.product import Product
from app.models.code_key import CodeKey
from app.models.category import Category

router = APIRouter()
_category_cache_build_lock = asyncio.Lock()


def _normalize_query(q: str | None) -> str:
    return (q or "").strip().lower()


def _product_payload(product: Product, category_name: str | None, stock: int) -> dict:
    return {
        "id": product.id,
        "category_id": product.category_id,
        "category_name": category_name or "",
        "name": product.name,
        "description": product.description,
        "cover_image": product.cover_image,
        "price": str(product.price),
        "sort_order": product.sort_order,
        "sold_count": product.sold_count or 0,
        "available_stock": stock or 0,
        "is_on_sale": (stock or 0) > 0,
    }


def _product_row_payload(
    *,
    product_id: int,
    category_id: int | None,
    category_name: str | None,
    name: str,
    description: str | None,
    cover_image: str | None,
    price,
    sort_order: int,
    sold_count: int | None,
    stock: int,
) -> dict:
    return {
        "id": product_id,
        "category_id": category_id,
        "category_name": category_name or "",
        "name": name,
        "description": description,
        "cover_image": cover_image,
        "price": str(price),
        "sort_order": sort_order,
        "sold_count": sold_count or 0,
        "available_stock": stock or 0,
        "is_on_sale": (stock or 0) > 0,
    }


def _slice_products(items: list[dict], offset: int, limit: int, after_id: int = 0) -> dict:
    start = offset
    if after_id > 0:
        cursor_index = next((index for index, item in enumerate(items) if int(item.get("id") or 0) == after_id), None)
        start = len(items) if cursor_index is None else cursor_index + 1
    page_items = items[start:start + limit]
    next_cursor = int(page_items[-1]["id"]) if page_items else after_id
    return {
        "items": page_items,
        "total": len(items),
        "offset": start,
        "limit": limit,
        "prev_cursor": int(page_items[0]["id"]) if page_items else after_id,
        "next_cursor": next_cursor,
        "before_cursor": int(page_items[0]["id"]) if page_items else after_id,
        "after_cursor": next_cursor,
        "has_more": start + len(page_items) < len(items),
    }


def _filter_products(items: list[dict], q: str | None) -> list[dict]:
    query = _normalize_query(q)
    if not query:
        return items
    return [item for item in items if query in str(item.get("name") or "").lower()]


async def _build_category_product_cache(db: AsyncSession) -> dict[str, list[dict]]:
    category_rows = (
        await db.execute(
            select(Category.id)
            .where(Category.is_active == True, Category.is_deleted == False)
        )
    ).scalars().all()
    buckets: dict[str, list[dict]] = {"all": []}
    for category_id in category_rows:
        buckets.setdefault(str(category_id), [])

    stock_subq = (
        select(
            CodeKey.product_id.label("product_id"),
            func.count(CodeKey.id).label("available_stock"),
        )
        .where(CodeKey.status == "unused", CodeKey.is_deleted == False)
        .group_by(CodeKey.product_id)
        .subquery()
    )
    stmt = (
        select(
            Product.id,
            Product.category_id,
            Category.name.label("category_name"),
            Product.name,
            Product.description,
            Product.cover_image,
            Product.price,
            Product.sort_order,
            Product.sold_count,
            func.coalesce(stock_subq.c.available_stock, 0).label("available_stock"),
        )
        .outerjoin(Category, Product.category_id == Category.id)
        .outerjoin(stock_subq, stock_subq.c.product_id == Product.id)
        .where(Product.is_deleted == False)
        .order_by(Product.sort_order.desc(), Product.id.desc())
    )
    rows = (await db.execute(stmt)).all()

    for row in rows:
        item = _product_row_payload(
            product_id=row.id,
            category_id=row.category_id,
            category_name=row.category_name,
            name=row.name,
            description=row.description,
            cover_image=row.cover_image,
            price=row.price,
            sort_order=row.sort_order,
            sold_count=row.sold_count,
            stock=row.available_stock or 0,
        )
        buckets["all"].append(item)
        if row.category_id is not None:
            buckets.setdefault(str(row.category_id), []).append(item)

    await cache_set_hash_many_json(RedisKeys.products_by_category_hash(), buckets, PUBLIC_CATALOG_TTL_SECONDS)

    return buckets


async def _get_cached_category_products(db: AsyncSession, category_id: int | None) -> list[dict]:
    cache_field = "all" if category_id is None else str(category_id)
    cached = await cache_get_hash_json(RedisKeys.products_by_category_hash(), cache_field)
    if isinstance(cached, list):
        return cached

    async with _category_cache_build_lock:
        cached = await cache_get_hash_json(RedisKeys.products_by_category_hash(), cache_field)
        if isinstance(cached, list):
            return cached

        buckets = await _build_category_product_cache(db)
        items = buckets.get(cache_field, [])
        if cache_field not in buckets:
            await cache_set_hash_many_json(
                RedisKeys.products_by_category_hash(),
                {cache_field: items},
                PUBLIC_CATALOG_TTL_SECONDS,
            )
        return items


@router.get("/products")
async def get_products(
    category_id: int | None = Query(None),
    q: str | None = Query(None),
    after_id: int = Query(0, ge=0),
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    cached_items = await _get_cached_category_products(db, category_id)
    data = _slice_products(_filter_products(cached_items, q), offset, limit, after_id)
    return {"code": 200, "msg": "success", "data": data}


@router.get("/products/{product_id}")
async def get_product_detail(
    product_id: int,
    db: AsyncSession = Depends(get_db),
):
    cached = await cache_get_json(RedisKeys.product_detail(product_id))
    if cached is not None:
        return {"code": 200, "msg": "success", "data": cached}

    stock_subq = (
        select(
            CodeKey.product_id.label("product_id"),
            func.count(CodeKey.id).label("available_stock"),
        )
        .where(CodeKey.product_id == product_id, CodeKey.status == "unused", CodeKey.is_deleted == False)
        .group_by(CodeKey.product_id)
        .subquery()
    )
    stmt = (
        select(
            Product.id,
            Product.category_id,
            Category.name.label("category_name"),
            Product.name,
            Product.description,
            Product.cover_image,
            Product.price,
            Product.sort_order,
            Product.sold_count,
            func.coalesce(stock_subq.c.available_stock, 0).label("available_stock"),
        )
        .outerjoin(Category, Product.category_id == Category.id)
        .outerjoin(stock_subq, stock_subq.c.product_id == Product.id)
        .where(Product.id == product_id, Product.is_deleted == False)
    )
    result = await db.execute(stmt)
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail={"code": 404, "msg": "商品不存在", "data": None})

    data = {
        "id": row.id,
        "category_id": row.category_id,
        "category_name": row.category_name or "",
        "name": row.name,
        "description": row.description,
        "cover_image": row.cover_image,
        "price": str(row.price),
        "sort_order": row.sort_order,
        "sold_count": row.sold_count or 0,
        "available_stock": row.available_stock or 0,
        "is_on_sale": (row.available_stock or 0) > 0,
    }

    await cache_set_json(RedisKeys.product_detail(product_id), data, PUBLIC_CATALOG_TTL_SECONDS)

    return {"code": 200, "msg": "success", "data": data}
