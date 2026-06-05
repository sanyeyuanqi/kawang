from __future__ import annotations

import hashlib
from decimal import Decimal
from typing import Any

from pathlib import Path

from fastapi import APIRouter, Depends, Query, UploadFile, File
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin
from app.database import get_db
from app.models.category import Category
from app.models.code_key import CodeKey
from app.models.product import Product
from app.config import settings
from app.services.catalog_cache import invalidate_catalog_cache

router = APIRouter()


class ProductPayload(BaseModel):
    category_id: int | None = None
    name: str
    description: str | None = None
    cover_image: str | None = None
    price: Decimal
    sort_order: int = 0
    sold_count: int = 0


class ProductUpdatePayload(BaseModel):
    category_id: int | None = None
    name: str | None = None
    description: str | None = None
    cover_image: str | None = None
    price: Decimal | None = None
    sort_order: int | None = None
    sold_count: int | None = None


def _product_dict(product: Product, stock: int = 0, category_name: str | None = None) -> dict[str, Any]:
    return {
        "id": product.id,
        "category_id": product.category_id,
        "category_name": category_name or (product.category.name if product.category else None),
        "name": product.name,
        "description": product.description,
        "cover_image": product.cover_image,
        "price": str(product.price),
        "sort_order": product.sort_order,
        "sold_count": product.sold_count or 0,
        "stock": stock,
        "available_stock": stock,
        "status": "on_sale" if stock > 0 else "sold_out",
        "created_at": product.created_at.strftime("%Y-%m-%d %H:%M:%S") if product.created_at else None,
        "updated_at": product.updated_at.strftime("%Y-%m-%d %H:%M:%S") if product.updated_at else None,
    }


def _error(status_code: int, code: int, msg: str) -> None:
    from app.main import AppError

    raise AppError(code=code, msg=msg, status_code=status_code)


@router.get("/products")
async def list_products(
    _: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    q: str | None = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
) -> dict[str, Any]:
    stock_subq = (
        select(func.count(CodeKey.id))
        .where(CodeKey.product_id == Product.id, CodeKey.status == "unused", CodeKey.is_deleted == False)
        .scalar_subquery()
    )
    stmt = (
        select(Product, Category.name.label("category_name"), stock_subq.label("stock"))
        .outerjoin(Category, Product.category_id == Category.id)
        .where(Product.is_deleted == False)
    )
    count_stmt = select(func.count(Product.id)).where(Product.is_deleted == False)
    if q:
        stmt = stmt.where(Product.name.like(f"%{q}%"))
        count_stmt = count_stmt.where(Product.name.like(f"%{q}%"))
    rows = (await db.execute(stmt.order_by(Product.sort_order.desc(), Product.id.desc()).offset(offset).limit(limit))).all()
    total = (await db.execute(count_stmt)).scalar() or 0
    return {"code": 200, "msg": "success", "data": {"items": [_product_dict(p, s or 0, category_name) for p, category_name, s in rows], "total": total, "offset": offset, "limit": limit}}


@router.post("/products")
async def create_product(payload: ProductPayload, _: dict = Depends(get_current_admin), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    product = Product(**payload.model_dump())
    db.add(product)
    await db.flush()
    await db.refresh(product)
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
    await db.flush()
    await db.refresh(product)
    stock = (await db.execute(select(func.count(CodeKey.id)).where(CodeKey.product_id == product.id, CodeKey.status == "unused", CodeKey.is_deleted == False))).scalar() or 0
    await invalidate_catalog_cache(product_ids=[product.id], clear_categories=True, clear_products=True, clear_stock=True)
    return {"code": 200, "msg": "success", "data": _product_dict(product, stock)}


@router.delete("/products/{product_id}")
async def delete_product(product_id: int, _: dict = Depends(get_current_admin), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    product = (await db.execute(select(Product).where(Product.id == product_id, Product.is_deleted == False))).scalar_one_or_none()
    if product is None:
        _error(404, 404, "商品不存在")
    product.is_deleted = True
    await db.flush()
    await invalidate_catalog_cache(product_ids=[product.id], clear_categories=True, clear_products=True, clear_stock=True)
    return {"code": 200, "msg": "success", "data": None}
