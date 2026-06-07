from __future__ import annotations

from time import monotonic
from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin
from app.database import get_db
from app.models.category import Category
from app.models.product import Product
from app.services.catalog_cache import invalidate_catalog_cache

router = APIRouter()
_ADMIN_CATEGORY_CACHE_TTL_SECONDS = 60
_admin_category_cache: dict[tuple[int, int], tuple[float, dict[str, Any]]] = {}


class CategoryPayload(BaseModel):
    name: str
    subtitle: str | None = None
    sort_order: int = 0
    is_active: bool = True


class CategoryUpdatePayload(BaseModel):
    name: str | None = None
    subtitle: str | None = None
    sort_order: int | None = None
    is_active: bool | None = None


def _error(status_code: int, code: int, msg: str) -> None:
    from app.main import AppError

    raise AppError(code=code, msg=msg, status_code=status_code)


def _category_dict(category: Category, product_count: int = 0) -> dict[str, Any]:
    return {
        "id": category.id,
        "name": category.name,
        "subtitle": category.subtitle,
        "sort_order": category.sort_order,
        "is_active": category.is_active,
        "product_count": product_count,
        "created_at": category.created_at.strftime("%Y-%m-%d %H:%M:%S") if category.created_at else None,
        "updated_at": category.updated_at.strftime("%Y-%m-%d %H:%M:%S") if category.updated_at else None,
    }


def _category_row_dict(row: Any) -> dict[str, Any]:
    return {
        "id": row.id,
        "name": row.name,
        "subtitle": row.subtitle,
        "sort_order": row.sort_order,
        "is_active": row.is_active,
        "product_count": int(row.product_count or 0),
        "created_at": row.created_at.strftime("%Y-%m-%d %H:%M:%S") if row.created_at else None,
        "updated_at": row.updated_at.strftime("%Y-%m-%d %H:%M:%S") if row.updated_at else None,
    }


async def _clear_public_category_cache() -> None:
    clear_admin_category_cache()
    await invalidate_catalog_cache(clear_categories=True, clear_products=True, clear_stock=True)


def clear_admin_category_cache() -> None:
    _admin_category_cache.clear()


@router.get("/categories")
async def list_categories(
    _: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
) -> dict[str, Any]:
    cache_key = (offset, limit)
    cached = _admin_category_cache.get(cache_key)
    if cached is not None and cached[0] > monotonic():
        return cached[1]

    product_count_subq = (
        select(
            Product.category_id.label("category_id"),
            func.count(Product.id).label("product_count"),
        )
        .where(Product.is_deleted == False)
        .group_by(Product.category_id)
        .subquery()
    )
    stmt = (
        select(
            Category.id,
            Category.name,
            Category.subtitle,
            Category.sort_order,
            Category.is_active,
            Category.created_at,
            Category.updated_at,
            func.coalesce(product_count_subq.c.product_count, 0).label("product_count"),
        )
        .outerjoin(product_count_subq, product_count_subq.c.category_id == Category.id)
        .where(Category.is_deleted == False)
        .order_by(Category.sort_order, Category.id)
        .offset(offset)
        .limit(limit)
    )
    rows = (await db.execute(stmt)).all()
    total = int(await db.scalar(select(func.count(Category.id)).where(Category.is_deleted == False)) or 0)
    response = {
        "code": 200,
        "msg": "success",
        "data": {
            "items": [_category_row_dict(row) for row in rows],
            "total": total,
            "offset": offset,
            "limit": limit,
        },
    }
    _admin_category_cache[cache_key] = (monotonic() + _ADMIN_CATEGORY_CACHE_TTL_SECONDS, response)
    return response


@router.post("/categories")
async def create_category(payload: CategoryPayload, _: dict = Depends(get_current_admin), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    category = Category(**payload.model_dump())
    db.add(category)
    await db.flush()
    await db.refresh(category)
    await _clear_public_category_cache()
    return {"code": 200, "msg": "success", "data": _category_dict(category)}


@router.put("/categories/{category_id}")
async def update_category(category_id: int, payload: CategoryUpdatePayload, _: dict = Depends(get_current_admin), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    category = (await db.execute(select(Category).where(Category.id == category_id, Category.is_deleted == False))).scalar_one_or_none()
    if category is None:
        _error(404, 404, "分类不存在")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(category, key, value)
    await db.flush()
    await db.refresh(category)
    product_count = (await db.execute(select(func.count(Product.id)).where(Product.category_id == category_id, Product.is_deleted == False))).scalar() or 0
    await _clear_public_category_cache()
    return {"code": 200, "msg": "success", "data": _category_dict(category, product_count)}


@router.delete("/categories/{category_id}")
async def delete_category(category_id: int, _: dict = Depends(get_current_admin), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    category = (await db.execute(select(Category).where(Category.id == category_id, Category.is_deleted == False))).scalar_one_or_none()
    if category is None:
        _error(404, 404, "分类不存在")
    product_count = (await db.execute(select(func.count(Product.id)).where(Product.category_id == category_id, Product.is_deleted == False))).scalar() or 0
    if product_count:
        _error(400, 400, f"该分类下有 {product_count} 个商品，请先移走")
    category.is_deleted = True
    await db.flush()
    await _clear_public_category_cache()
    return {"code": 200, "msg": "success", "data": None}
