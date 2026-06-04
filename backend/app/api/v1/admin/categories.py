from __future__ import annotations

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


async def _clear_public_category_cache() -> None:
    await invalidate_catalog_cache(clear_categories=True, clear_products=True, clear_stock=True)


@router.get("/categories")
async def list_categories(
    _: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
) -> dict[str, Any]:
    product_count_subq = (
        select(func.count(Product.id))
        .where(Product.category_id == Category.id, Product.is_deleted == False)
        .scalar_subquery()
    )
    stmt = (
        select(Category, product_count_subq.label("product_count"))
        .where(Category.is_deleted == False)
        .order_by(Category.sort_order, Category.id)
        .offset(offset)
        .limit(limit)
    )
    total = (await db.execute(select(func.count(Category.id)).where(Category.is_deleted == False))).scalar() or 0
    rows = (await db.execute(stmt)).all()
    return {"code": 200, "msg": "success", "data": {"items": [_category_dict(c, product_count or 0) for c, product_count in rows], "total": total, "offset": offset, "limit": limit}}


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
