from __future__ import annotations

import hashlib
from decimal import Decimal
from time import monotonic
from typing import Any, Literal

from pathlib import Path

from fastapi import APIRouter, Depends, Query, UploadFile, File
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin
from app.api.v1.admin.categories import clear_admin_category_cache
from app.database import get_db
from app.models.category import Category
from app.models.code_key import CodeKey
from app.models.product import Product
from app.config import settings
from app.services.catalog_cache import invalidate_catalog_cache
from app.utils.db_indexes import mysql_index_exists

router = APIRouter()
PRODUCT_TYPE_AUTO_DELIVERY = "auto_delivery"
PRODUCT_TYPE_PREORDER = "preorder"
ProductType = Literal["auto_delivery", "preorder"]
_ADMIN_PRODUCT_CACHE_TTL_SECONDS = 60
_admin_product_cache: dict[tuple[str | None, int, int, bool], tuple[float, dict[str, Any]]] = {}


def clear_admin_product_cache() -> None:
    _admin_product_cache.clear()


class ProductPayload(BaseModel):
    category_id: int | None = None
    name: str
    description: str | None = None
    usage_instructions: str | None = None
    cover_image: str | None = None
    price: Decimal
    product_type: ProductType = PRODUCT_TYPE_AUTO_DELIVERY
    preorder_stock: int = Field(0, ge=0)
    sort_order: int = 0
    sold_count: int = 0


class ProductUpdatePayload(BaseModel):
    category_id: int | None = None
    name: str | None = None
    description: str | None = None
    usage_instructions: str | None = None
    cover_image: str | None = None
    price: Decimal | None = None
    product_type: ProductType | None = None
    preorder_stock: int | None = Field(None, ge=0)
    sort_order: int | None = None
    sold_count: int | None = None


def _stock_for_product(product: Product, code_stock: int = 0) -> int:
    if (product.product_type or PRODUCT_TYPE_AUTO_DELIVERY) == PRODUCT_TYPE_PREORDER:
        return int(product.preorder_stock or 0)
    return int(code_stock or 0)


def _product_dict(product: Product, stock: int = 0, category_name: str | None = None) -> dict[str, Any]:
    actual_stock = _stock_for_product(product, stock)
    return {
        "id": product.id,
        "category_id": product.category_id,
        "category_name": category_name,
        "name": product.name,
        "description": product.description,
        "usage_instructions": product.usage_instructions,
        "cover_image": product.cover_image,
        "price": str(product.price),
        "product_type": product.product_type or PRODUCT_TYPE_AUTO_DELIVERY,
        "preorder_stock": product.preorder_stock or 0,
        "sort_order": product.sort_order,
        "sold_count": product.sold_count or 0,
        "stock": actual_stock,
        "available_stock": actual_stock,
        "status": "on_sale" if actual_stock > 0 else "sold_out",
        "created_at": product.created_at.strftime("%Y-%m-%d %H:%M:%S") if product.created_at else None,
        "updated_at": product.updated_at.strftime("%Y-%m-%d %H:%M:%S") if product.updated_at else None,
    }


def _product_row_dict(row: Any) -> dict[str, Any]:
    product_type = row.product_type or PRODUCT_TYPE_AUTO_DELIVERY
    stock = int(row.preorder_stock or 0) if product_type == PRODUCT_TYPE_PREORDER else int(row.stock or 0)
    return {
        "id": row.id,
        "category_id": row.category_id,
        "category_name": row.category_name,
        "name": row.name,
        "description": row.description,
        "usage_instructions": row.usage_instructions,
        "cover_image": row.cover_image,
        "price": str(row.price),
        "product_type": product_type,
        "preorder_stock": row.preorder_stock or 0,
        "sort_order": row.sort_order,
        "sold_count": row.sold_count or 0,
        "stock": stock,
        "available_stock": stock,
        "status": "on_sale" if stock > 0 else "sold_out",
        "created_at": row.created_at.strftime("%Y-%m-%d %H:%M:%S") if row.created_at else None,
        "updated_at": row.updated_at.strftime("%Y-%m-%d %H:%M:%S") if row.updated_at else None,
    }


def _error(status_code: int, code: int, msg: str) -> None:
    from app.main import AppError

    raise AppError(code=code, msg=msg, status_code=status_code)


@router.get("/products")
async def list_products(
    _: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    q: str | None = Query(None),
    options_only: bool = Query(False),
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
) -> dict[str, Any]:
    cache_key = (q.strip() if q else None, offset, limit, options_only)
    cached = _admin_product_cache.get(cache_key)
    if cached is not None and cached[0] > monotonic():
        return cached[1]

    if options_only:
        stmt = select(Product.id, Product.name).where(Product.is_deleted == False)
        if q:
            stmt = stmt.where(Product.name.like(f"%{q}%"))
        total = await db.scalar(select(func.count(Product.id)).where(Product.is_deleted == False)) if not q else None
        if q:
            total_stmt = select(func.count(Product.id)).where(Product.is_deleted == False, Product.name.like(f"%{q}%"))
            total = await db.scalar(total_stmt)
        rows = (
            await db.execute(
                stmt.order_by(Product.sort_order.desc(), Product.id.desc())
                .offset(offset)
                .limit(limit)
            )
        ).all()
        response = {
            "code": 200,
            "msg": "success",
            "data": {
                "items": [{"id": product_id, "name": name} for product_id, name in rows],
                "total": int(total or 0),
                "offset": offset,
                "limit": limit,
            },
        }
        _admin_product_cache[cache_key] = (monotonic() + _ADMIN_PRODUCT_CACHE_TTL_SECONDS, response)
        return response

    stock_summary_index_exists = await mysql_index_exists(db, "code_key", "ix_code_key_deleted_product_status_created")
    stock_subq_stmt = (
        select(
            CodeKey.product_id.label("product_id"),
            func.count(CodeKey.id).label("stock"),
        )
        .where(CodeKey.status == "unused", CodeKey.is_deleted == False)
        .group_by(CodeKey.product_id)
    )
    if stock_summary_index_exists:
        stock_subq_stmt = stock_subq_stmt.with_hint(CodeKey, "FORCE INDEX (ix_code_key_deleted_product_status_created)", dialect_name="mysql")
    stock_subq = stock_subq_stmt.subquery()
    stmt = (
        select(
            Product.id,
            Product.category_id,
            Product.name,
            Product.description,
            Product.usage_instructions,
            Product.cover_image,
            Product.price,
            Product.product_type,
            Product.preorder_stock,
            Product.sort_order,
            Product.sold_count,
            Product.created_at,
            Product.updated_at,
            Category.name.label("category_name"),
            func.coalesce(stock_subq.c.stock, 0).label("stock"),
        )
        .outerjoin(Category, Product.category_id == Category.id)
        .outerjoin(stock_subq, stock_subq.c.product_id == Product.id)
        .where(Product.is_deleted == False)
    )
    if q:
        stmt = stmt.where(Product.name.like(f"%{q}%"))
    rows = (await db.execute(stmt.order_by(Product.sort_order.desc(), Product.id.desc()).offset(offset).limit(limit))).all()
    count_stmt = select(func.count(Product.id)).where(Product.is_deleted == False)
    if q:
        count_stmt = count_stmt.where(Product.name.like(f"%{q}%"))
    total = int(await db.scalar(count_stmt) or 0)
    response = {
        "code": 200,
        "msg": "success",
        "data": {
            "items": [_product_row_dict(row) for row in rows],
            "total": total,
            "offset": offset,
            "limit": limit,
        },
    }
    _admin_product_cache[cache_key] = (monotonic() + _ADMIN_PRODUCT_CACHE_TTL_SECONDS, response)
    return response


@router.post("/products")
async def create_product(payload: ProductPayload, _: dict = Depends(get_current_admin), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    product = Product(**payload.model_dump())
    if product.product_type == PRODUCT_TYPE_AUTO_DELIVERY:
        product.preorder_stock = 0
    db.add(product)
    await db.flush()
    await db.refresh(product)
    clear_admin_category_cache()
    clear_admin_product_cache()
    await invalidate_catalog_cache(product_ids=[product.id], clear_categories=True, clear_products=True, clear_stock=True)
    return {"code": 200, "msg": "success", "data": _product_dict(product)}


@router.post("/upload")
async def upload_image(file: UploadFile = File(...), _: dict = Depends(get_current_admin)) -> dict[str, Any]:
    suffix = Path(file.filename or "").suffix.lower().lstrip(".")
    if suffix not in settings.ALLOWED_EXTENSIONS:
        _error(400, 400, "不支持的图片格式")
    content = await file.read()
    if len(content) > settings.MAX_UPLOAD_SIZE:
        _error(400, 400, "图片大小超过限制")
    file_md5 = hashlib.md5(content).hexdigest()
    upload_dir = Path(settings.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{file_md5}.{suffix}"
    target = upload_dir / filename
    duplicated = target.exists()
    if not duplicated:
        target.write_bytes(content)
    return {
        "code": 200,
        "msg": "success",
        "data": {
            "url": f"/static/{filename}",
            "filename": filename,
            "md5": file_md5,
            "duplicated": duplicated,
        },
    }


@router.put("/products/{product_id}")
async def update_product(product_id: int, payload: ProductUpdatePayload, _: dict = Depends(get_current_admin), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    product = (await db.execute(select(Product).where(Product.id == product_id, Product.is_deleted == False))).scalar_one_or_none()
    if product is None:
        _error(404, 404, "商品不存在")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(product, key, value)
    if product.product_type == PRODUCT_TYPE_AUTO_DELIVERY:
        product.preorder_stock = 0
    await db.flush()
    await db.refresh(product)
    stock_stmt = select(func.count(CodeKey.id)).where(CodeKey.product_id == product.id, CodeKey.status == "unused", CodeKey.is_deleted == False)
    if await mysql_index_exists(db, "code_key", "ix_code_key_product_status_deleted"):
        stock_stmt = stock_stmt.with_hint(CodeKey, "FORCE INDEX (ix_code_key_product_status_deleted)", dialect_name="mysql")
    stock = (await db.execute(stock_stmt)).scalar() or 0
    clear_admin_category_cache()
    clear_admin_product_cache()
    await invalidate_catalog_cache(product_ids=[product.id], clear_categories=True, clear_products=True, clear_stock=True)
    return {"code": 200, "msg": "success", "data": _product_dict(product, stock)}


@router.delete("/products/{product_id}")
async def delete_product(product_id: int, _: dict = Depends(get_current_admin), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    product = (await db.execute(select(Product).where(Product.id == product_id, Product.is_deleted == False))).scalar_one_or_none()
    if product is None:
        _error(404, 404, "商品不存在")
    product.is_deleted = True
    await db.flush()
    clear_admin_category_cache()
    clear_admin_product_cache()
    await invalidate_catalog_cache(product_ids=[product.id], clear_categories=True, clear_products=True, clear_stock=True)
    return {"code": 200, "msg": "success", "data": None}
