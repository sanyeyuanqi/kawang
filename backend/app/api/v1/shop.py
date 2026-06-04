import json
import logging
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.utils.redis import get_redis, RedisKeys
from app.models.shop_config import ShopConfig

logger = logging.getLogger(__name__)
router = APIRouter()
CACHE_TTL = 1800


@router.get("/shop")
async def get_shop_config(db: AsyncSession = Depends(get_db)):
    try:
        r = await get_redis()
        cached = await r.get(RedisKeys.shop_cache())
        if cached:
            return {"code": 200, "msg": "success", "data": json.loads(cached)}
    except Exception:
        r = None

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

    if r:
        try:
            await r.setex(RedisKeys.shop_cache(), CACHE_TTL, json.dumps(data, ensure_ascii=False))
        except Exception:
            pass

    return {"code": 200, "msg": "success", "data": data}
