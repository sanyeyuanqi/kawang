from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.services.catalog_cache import cache_get_json, cache_set_json
from app.utils.redis import RedisKeys
from app.models.category import Category

router = APIRouter()
CACHE_TTL = 600


@router.get("/categories")
async def get_categories(db: AsyncSession = Depends(get_db)):
    cached = await cache_get_json(RedisKeys.categories_cache())
    if cached is not None:
        return {"code": 200, "msg": "success", "data": cached}

    stmt = (
        select(Category)
        .where(Category.is_active == True, Category.is_deleted == False)
        .order_by(Category.sort_order)
    )
    result = await db.execute(stmt)
    categories = result.scalars().all()

    data = [
        {
            "id": c.id, "name": c.name, "subtitle": c.subtitle,
            "sort_order": c.sort_order, "is_active": c.is_active,
        }
        for c in categories
    ]

    await cache_set_json(RedisKeys.categories_cache(), data, CACHE_TTL)

    return {"code": 200, "msg": "success", "data": data}
