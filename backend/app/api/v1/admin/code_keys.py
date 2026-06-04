from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import and_, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin
from app.database import get_db
from app.models.category import Category
from app.models.code_key import CodeKey, CodeKeyStatus
from app.models.order import Order
from app.models.product import Product
from app.services.catalog_cache import STOCK_CACHE_TTL_SECONDS, cache_get_json, cache_set_json, invalidate_catalog_cache
from app.utils.redis import RedisKeys

router = APIRouter()


class ImportCodesPayload(BaseModel):
    product_id: int
    codes: list[str] | str


class CodePayload(BaseModel):
    code_value: str
    status: CodeKeyStatus = CodeKeyStatus.UNUSED


class CodeStockUpdatePayload(BaseModel):
    sort_order: int | None = None
    product_id: int | None = None


class CodeUpdatePayload(BaseModel):
    code_value: str | None = None
    status: CodeKeyStatus | None = None


class CodeBatchDeletePayload(BaseModel):
    ids: list[int]


def _error(status_code: int, code: int, msg: str) -> None:
    from app.main import AppError

    raise AppError(code=code, msg=msg, status_code=status_code)


def _code_dict(code: CodeKey, contact_info: str | None = None, product_name: str | None = None) -> dict[str, Any]:
    return {
        "id": code.id,
        "product_id": code.product_id,
        "product_name": product_name or (code.product.name if code.product else None),
        "code_value": code.code_value,
        "status": code.status.value if hasattr(code.status, "value") else code.status,
        "order_id": code.order_id,
        "contact_info": contact_info,
        "created_at": code.created_at.strftime("%Y-%m-%d %H:%M:%S") if code.created_at else None,
    }


@router.get("/code-keys")
async def stock_summary(
    _: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
) -> dict[str, Any]:
    cache_key = RedisKeys.stock_summary(offset, limit)
    cached = await cache_get_json(cache_key)
    if cached is not None:
        return {"code": 200, "msg": "success", "data": cached}

    code_join = and_(CodeKey.product_id == Product.id, CodeKey.is_deleted == False)
    stmt = (
        select(
            Product.id.label("product_id"),
            Product.name.label("product_name"),
            Product.sort_order,
            Category.name.label("category_name"),
            func.sum(case((CodeKey.status == CodeKeyStatus.UNUSED, 1), else_=0)).label("unused_count"),
            func.sum(case((CodeKey.status == CodeKeyStatus.ASSIGNED, 1), else_=0)).label("assigned_count"),
            func.count(CodeKey.id).label("total_count"),
            func.max(CodeKey.created_at).label("last_import_time"),
        )
        .outerjoin(Category, Product.category_id == Category.id)
        .outerjoin(CodeKey, code_join)
        .where(Product.is_deleted == False)
        .group_by(Product.id, Product.name, Product.sort_order, Category.name)
        .order_by(Product.sort_order.desc(), Product.id.desc())
        .offset(offset)
        .limit(limit)
    )
    rows = await db.execute(stmt)
    total = (await db.execute(select(func.count(Product.id)).where(Product.is_deleted == False))).scalar() or 0
    data = {
        "items": [
            {
                "id": product_id,
                "product_id": product_id,
                "sort_order": sort_order,
                "product_name": product_name,
                "category_name": category_name,
                "unused_count": int(unused_count or 0),
                "assigned_count": int(assigned_count or 0),
                "total_count": int(total_count or 0),
                "last_import_time": last_import_time.strftime("%Y-%m-%d %H:%M:%S") if last_import_time else None,
            }
            for product_id, product_name, sort_order, category_name, unused_count, assigned_count, total_count, last_import_time in rows.all()
        ],
        "total": total,
        "offset": offset,
        "limit": limit,
    }
    await cache_set_json(cache_key, data, STOCK_CACHE_TTL_SECONDS)
    return {"code": 200, "msg": "success", "data": data}


@router.get("/code-keys/{product_id}/codes")
async def list_codes(
    product_id: int,
    _: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    status: CodeKeyStatus | None = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> dict[str, Any]:
    stmt = (
        select(CodeKey, Order.contact_info, Product.name)
        .join(Product, CodeKey.product_id == Product.id)
        .outerjoin(Order, CodeKey.order_id == Order.id)
        .where(CodeKey.product_id == product_id, CodeKey.is_deleted == False)
    )
    count_stmt = select(func.count(CodeKey.id)).where(CodeKey.product_id == product_id, CodeKey.is_deleted == False)
    if status:
        stmt = stmt.where(CodeKey.status == status)
        count_stmt = count_stmt.where(CodeKey.status == status)
    rows = (await db.execute(stmt.order_by(CodeKey.id.desc()).offset(offset).limit(limit))).all()
    total = (await db.execute(count_stmt)).scalar() or 0
    return {"code": 200, "msg": "success", "data": {"items": [_code_dict(code, contact_info, product_name) for code, contact_info, product_name in rows], "total": total, "offset": offset, "limit": limit}}


@router.put("/code-keys/codes/{code_id}")
async def update_code(
    code_id: int,
    payload: CodeUpdatePayload,
    _: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    code = (await db.execute(select(CodeKey).where(CodeKey.id == code_id, CodeKey.is_deleted == False))).scalar_one_or_none()
    if code is None:
        _error(404, 404, "卡密不存在")
    if payload.code_value is not None:
        next_value = payload.code_value.strip()
        if not next_value:
            _error(400, 400, "卡密内容不能为空")
        code.code_value = next_value
    if payload.status is not None:
        if code.order_id and payload.status != CodeKeyStatus.ASSIGNED:
            _error(400, 400, "已发卡卡密不能手动改为其他状态")
        code.status = payload.status
    await db.flush()
    await invalidate_catalog_cache(product_ids=[code.product_id], clear_products=True, clear_stock=True)
    return {"code": 200, "msg": "success", "data": _code_dict(code)}


@router.delete("/code-keys/codes/batch-delete")
async def batch_delete_codes(payload: CodeBatchDeletePayload, _: dict = Depends(get_current_admin), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    code_ids = list(dict.fromkeys(payload.ids))
    if not code_ids:
        _error(400, 400, "请选择要删除的卡密")
    codes = (await db.execute(select(CodeKey).where(CodeKey.id.in_(code_ids), CodeKey.is_deleted == False))).scalars().all()
    if len(codes) != len(code_ids):
        _error(404, 404, "部分卡密不存在")
    if any(code.status == CodeKeyStatus.ASSIGNED or code.order_id for code in codes):
        _error(400, 400, "已发卡卡密不能删除")
    product_ids = [code.product_id for code in codes]
    for code in codes:
        code.is_deleted = True
    await db.flush()
    await invalidate_catalog_cache(product_ids=product_ids, clear_products=True, clear_stock=True)
    return {"code": 200, "msg": "卡密已删除", "data": {"deleted_count": len(codes)}}


@router.delete("/code-keys/codes/{code_id}")
async def delete_code(code_id: int, _: dict = Depends(get_current_admin), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    code = (await db.execute(select(CodeKey).where(CodeKey.id == code_id, CodeKey.is_deleted == False))).scalar_one_or_none()
    if code is None:
        _error(404, 404, "卡密不存在")
    if code.status == CodeKeyStatus.ASSIGNED or code.order_id:
        _error(400, 400, "已发卡卡密不能删除")
    product_id = code.product_id
    code.is_deleted = True
    await db.flush()
    await invalidate_catalog_cache(product_ids=[product_id], clear_products=True, clear_stock=True)
    return {"code": 200, "msg": "卡密已删除", "data": None}


@router.get("/code-keys/{product_id}")
async def list_codes_legacy(
    product_id: int,
    _: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    status: CodeKeyStatus | None = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> dict[str, Any]:
    return await list_codes(product_id, _, db, status, offset, limit)


@router.post("/code-keys/import")
async def import_codes(payload: ImportCodesPayload, _: dict = Depends(get_current_admin), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    exists = (await db.execute(select(Product.id).where(Product.id == payload.product_id, Product.is_deleted == False))).scalar_one_or_none()
    if exists is None:
        _error(404, 404, "商品不存在")
    raw_codes = payload.codes.splitlines() if isinstance(payload.codes, str) else payload.codes
    values = list(dict.fromkeys([c.strip() for c in raw_codes if c.strip()]))
    for value in values:
        db.add(CodeKey(product_id=payload.product_id, code_value=value, status=CodeKeyStatus.UNUSED))
    await db.flush()
    await invalidate_catalog_cache(product_ids=[payload.product_id], clear_products=True, clear_stock=True)
    return {"code": 200, "msg": "success", "data": {"imported_count": len(values), "message": f"已导入 {len(values)} 张卡密"}}


@router.put("/code-keys/{code_id}")
async def update_stock_record(code_id: int, payload: CodeStockUpdatePayload, _: dict = Depends(get_current_admin), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    product = (await db.execute(select(Product).where(Product.id == code_id, Product.is_deleted == False))).scalar_one_or_none()
    if product is None:
        _error(404, 404, "库存记录不存在")
    affected_product_ids = [product.id]
    if payload.sort_order is not None:
        product.sort_order = payload.sort_order
    if payload.product_id is not None and payload.product_id != product.id:
        target = (await db.execute(select(Product).where(Product.id == payload.product_id, Product.is_deleted == False))).scalar_one_or_none()
        if target is None:
            _error(404, 404, "目标商品不存在")
        await db.execute(
            CodeKey.__table__.update()
            .where(CodeKey.product_id == product.id, CodeKey.status == CodeKeyStatus.UNUSED, CodeKey.is_deleted == False)
            .values(product_id=target.id)
        )
        affected_product_ids.append(target.id)
    await db.flush()
    await invalidate_catalog_cache(product_ids=affected_product_ids, clear_products=True, clear_stock=True)
    return {"code": 200, "msg": "success", "data": None}


@router.delete("/code-keys/{code_id}")
async def delete_stock_record(code_id: int, _: dict = Depends(get_current_admin), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    product = (await db.execute(select(Product).where(Product.id == code_id, Product.is_deleted == False))).scalar_one_or_none()
    if product is None:
        _error(404, 404, "库存记录不存在")
    unused_codes = (await db.execute(select(CodeKey).where(CodeKey.product_id == code_id, CodeKey.status == CodeKeyStatus.UNUSED, CodeKey.is_deleted == False))).scalars().all()
    for code in unused_codes:
        code.is_deleted = True
    await db.flush()
    await invalidate_catalog_cache(product_ids=[code_id], clear_products=True, clear_stock=True)
    return {"code": 200, "msg": "库存记录已删除", "data": {"deleted_count": len(unused_codes)}}
