from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.services.catalog_cache import PUBLIC_CATALOG_TTL_SECONDS, cache_get_json, cache_set_json
from app.utils.redis import RedisKeys
from app.models.product import Product
from app.models.code_key import CodeKey
from app.models.category import Category

router = APIRouter()


@router.get("/products")
async def get_products(
    category_id: int | None = Query(None),
    q: str | None = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    cache_key = RedisKeys.products_list(category_id, q, offset, limit)
    cached = await cache_get_json(cache_key)
    if cached is not None:
        return {"code": 200, "msg": "success", "data": cached}

    stock_subq = (
        select(func.count(CodeKey.id))
        .where(CodeKey.product_id == Product.id, CodeKey.status == "unused", CodeKey.is_deleted == False)
        .scalar_subquery()
    )
    stmt = (
        select(Product, Category.name.label("category_name"), stock_subq.label("available_stock"))
        .outerjoin(Category, Product.category_id == Category.id)
        .where(Product.is_deleted == False)
    )
    if category_id is not None:
        stmt = stmt.where(Product.category_id == category_id)
    if q:
        stmt = stmt.where(Product.name.like(f"%{q}%"))
    stmt = stmt.order_by(Product.sort_order.desc()).offset(offset).limit(limit)

    result = await db.execute(stmt)
    rows = result.all()

    count_stmt = select(func.count(Product.id)).where(Product.is_deleted == False)
    if category_id is not None:
        count_stmt = count_stmt.where(Product.category_id == category_id)
    if q:
        count_stmt = count_stmt.where(Product.name.like(f"%{q}%"))
    total = (await db.execute(count_stmt)).scalar() or 0

    items = []
    for p, category_name, stock in rows:
        items.append({
            "id": p.id, "category_id": p.category_id, "category_name": category_name or "", "name": p.name,
            "description": p.description, "cover_image": p.cover_image,
            "price": str(p.price), "sort_order": p.sort_order,
            "sold_count": p.sold_count or 0,
            "available_stock": stock or 0, "is_on_sale": (stock or 0) > 0,
        })

    data = {"items": items, "total": total, "offset": offset, "limit": limit}
    await cache_set_json(cache_key, data, PUBLIC_CATALOG_TTL_SECONDS)
    return {"code": 200, "msg": "success", "data": data}


@router.get("/products/{product_id}")
async def get_product_detail(
    product_id: int,
    db: AsyncSession = Depends(get_db),
):
    cached = await cache_get_json(RedisKeys.product_detail(product_id))
    if cached is not None:
        return {"code": 200, "msg": "success", "data": cached}

    stmt = select(Product).where(Product.id == product_id, Product.is_deleted == False)
    result = await db.execute(stmt)
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail={"code": 404, "msg": "商品不存在", "data": None})

    stock_stmt = select(func.count(CodeKey.id)).where(
        CodeKey.product_id == product_id, CodeKey.status == "unused", CodeKey.is_deleted == False
    )
    stock = (await db.execute(stock_stmt)).scalar() or 0

    cat_name = ""
    if product.category_id:
        cat_stmt = select(Category.name).where(Category.id == product.category_id)
        cat_name = (await db.execute(cat_stmt)).scalar() or ""

    data = {
        "id": product.id, "category_id": product.category_id, "category_name": cat_name,
        "name": product.name, "description": product.description,
        "cover_image": product.cover_image, "price": str(product.price),
        "sort_order": product.sort_order, "sold_count": product.sold_count or 0,
        "available_stock": stock, "is_on_sale": stock > 0,
    }

    await cache_set_json(RedisKeys.product_detail(product_id), data, PUBLIC_CATALOG_TTL_SECONDS)

    return {"code": 200, "msg": "success", "data": data}
