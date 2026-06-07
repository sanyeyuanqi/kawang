from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin
from app.api.v1.admin.products import clear_admin_product_cache
from app.database import get_db
from app.models.category import Category
from app.models.code_key import CODE_VALUE_MAX_LENGTH, CodeKey, CodeKeyStatus
from app.models.order import Order
from app.models.product import Product
from app.services.catalog_cache import STOCK_CACHE_TTL_SECONDS, cache_get_json, cache_set_json, invalidate_catalog_cache
from app.utils.db_indexes import mysql_index_exists
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


def _normalize_code_value(value: str) -> str:
    next_value = value.strip()
    if not next_value:
        _error(400, 400, "卡密内容不能为空")
    if len(next_value) > CODE_VALUE_MAX_LENGTH:
        _error(400, 400, f"单条卡密不能超过 {CODE_VALUE_MAX_LENGTH} 个字符")
    return next_value


def _code_dict(code: CodeKey, contact_info: str | None = None, product_name: str | None = None) -> dict[str, Any]:
    return {
        "id": code.id,
        "product_id": code.product_id,
        "product_name": product_name,
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

    has_stock_summary_index = await mysql_index_exists(db, "code_key", "ix_code_key_deleted_product_status_created")
    code_summary_stmt = (
        select(
            CodeKey.product_id.label("product_id"),
            func.sum(case((CodeKey.status == CodeKeyStatus.UNUSED, 1), else_=0)).label("unused_count"),
            func.sum(case((CodeKey.status == CodeKeyStatus.ASSIGNED, 1), else_=0)).label("assigned_count"),
            func.count(CodeKey.id).label("total_count"),
            func.max(CodeKey.created_at).label("last_import_time"),
        )
        .where(CodeKey.is_deleted == False)
        .group_by(CodeKey.product_id)
    )
    if has_stock_summary_index:
        code_summary_stmt = code_summary_stmt.with_hint(CodeKey, "FORCE INDEX (ix_code_key_deleted_product_status_created)", dialect_name="mysql")
    code_summary = code_summary_stmt.subquery()
    stmt = (
        select(
            Product.id.label("product_id"),
            Product.name.label("product_name"),
            Product.sort_order,
            Category.name.label("category_name"),
            func.coalesce(code_summary.c.unused_count, 0).label("unused_count"),
            func.coalesce(code_summary.c.assigned_count, 0).label("assigned_count"),
            func.coalesce(code_summary.c.total_count, 0).label("total_count"),
            code_summary.c.last_import_time,
        )
        .outerjoin(Category, Product.category_id == Category.id)
        .outerjoin(code_summary, code_summary.c.product_id == Product.id)
        .where(Product.is_deleted == False)
        .order_by(Product.sort_order.desc(), Product.id.desc())
        .offset(offset)
        .limit(limit)
    )
    rows = await db.execute(stmt)
    total = (await db.execute(select(func.count(Product.id)).where(Product.is_deleted == False))).scalar() or 0
    stats_stmt = (
        select(
            func.coalesce(func.sum(case((CodeKey.status == CodeKeyStatus.UNUSED, 1), else_=0)), 0).label("unused_count"),
            func.coalesce(func.sum(case((CodeKey.status == CodeKeyStatus.ASSIGNED, 1), else_=0)), 0).label("assigned_count"),
            func.count(CodeKey.id).label("total_count"),
        )
        .where(CodeKey.is_deleted == False)
    )
    if has_stock_summary_index:
        stats_stmt = stats_stmt.with_hint(CodeKey, "FORCE INDEX (ix_code_key_deleted_product_status_created)", dialect_name="mysql")
    stats_row = (await db.execute(stats_stmt)).one()
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
        "stats": {
            "products": int(total or 0),
            "unused": int(stats_row.unused_count or 0),
            "assigned": int(stats_row.assigned_count or 0),
            "total": int(stats_row.total_count or 0),
        },
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
        code_index = "ix_code_key_product_status_deleted"
    else:
        code_index = "ix_code_key_product_deleted_id"
    if await mysql_index_exists(db, "code_key", code_index):
        stmt = stmt.with_hint(CodeKey, f"FORCE INDEX ({code_index})", dialect_name="mysql")
        count_stmt = count_stmt.with_hint(CodeKey, f"FORCE INDEX ({code_index})", dialect_name="mysql")
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
        code.code_value = _normalize_code_value(payload.code_value)
    if payload.status is not None:
        if code.order_id and payload.status != CodeKeyStatus.ASSIGNED:
            _error(400, 400, "已发卡卡密不能手动改为其他状态")
        code.status = payload.status
    await db.flush()
    clear_admin_product_cache()
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
    clear_admin_product_cache()
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
    clear_admin_product_cache()
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
    values = list(dict.fromkeys([_normalize_code_value(c) for c in raw_codes if c.strip()]))
    for value in values:
        db.add(CodeKey(product_id=payload.product_id, code_value=value, status=CodeKeyStatus.UNUSED))
    await db.flush()
    clear_admin_product_cache()
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
    clear_admin_product_cache()
    await invalidate_catalog_cache(product_ids=affected_product_ids, clear_products=True, clear_stock=True)
    return {"code": 200, "msg": "success", "data": None}


@router.delete("/code-keys/{code_id}")
async def delete_stock_record(code_id: int, _: dict = Depends(get_current_admin), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    product = (await db.execute(select(Product).where(Product.id == code_id, Product.is_deleted == False))).scalar_one_or_none()
    if product is None:
        _error(404, 404, "库存记录不存在")
    unused_stmt = select(CodeKey).where(CodeKey.product_id == code_id, CodeKey.status == CodeKeyStatus.UNUSED, CodeKey.is_deleted == False)
    if await mysql_index_exists(db, "code_key", "ix_code_key_product_status_deleted"):
        unused_stmt = unused_stmt.with_hint(CodeKey, "FORCE INDEX (ix_code_key_product_status_deleted)", dialect_name="mysql")
    unused_codes = (await db.execute(unused_stmt)).scalars().all()
    for code in unused_codes:
        code.is_deleted = True
    await db.flush()
    clear_admin_product_cache()
    await invalidate_catalog_cache(product_ids=[code_id], clear_products=True, clear_stock=True)
    return {"code": 200, "msg": "库存记录已删除", "data": {"deleted_count": len(unused_codes)}}
