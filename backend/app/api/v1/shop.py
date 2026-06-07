import logging
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.services.catalog_cache import cache_get_json, cache_set_json
from app.utils.redis import RedisKeys
from app.models.shop_config import ShopConfig

logger = logging.getLogger(__name__)
router = APIRouter()
CACHE_TTL = 1800


@router.get("/shop")
async def get_shop_config(db: AsyncSession = Depends(get_db)):
    cached = await cache_get_json(RedisKeys.shop_cache())
    if cached is not None:
        return {"code": 200, "msg": "success", "data": cached}

    stmt = select(ShopConfig).where(ShopConfig.id == 1)
    result = await db.execute(stmt)
    config = result.scalar_one_or_none()

    if not config:
        return {"code": 200, "msg": "success", "data": {}}

    data = {
        "shop_name": config.shop_name, "shop_slogan": config.shop_slogan,
        "avatar_text": config.avatar_text, "contact_wechat": config.contact_wechat,
        "contact_qq": config.contact_qq, "is_open": config.is_open,
        "created_at": config.created_at.isoformat() if config.created_at else None,
        "updated_at": config.updated_at.isoformat() if config.updated_at else None,
    }

    await cache_set_json(RedisKeys.shop_cache(), data, CACHE_TTL)

    return {"code": 200, "msg": "success", "data": data}
