from __future__ import annotations

import json
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Iterable

from app.utils.redis import RedisKeys, get_redis, redis_delete, redis_delete_pattern, redis_get, redis_set

PUBLIC_CATALOG_TTL_SECONDS = 300
STOCK_CACHE_TTL_SECONDS = 120


def _json_default(value: Any) -> str:
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value.strftime("%Y-%m-%d %H:%M:%S")
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


async def cache_get_json(key: str) -> Any | None:
    try:
        raw = await redis_get(key)
        if not raw:
            return None
        return json.loads(raw)
    except Exception:
        return None


async def cache_set_json(key: str, value: Any, ttl: int = PUBLIC_CATALOG_TTL_SECONDS) -> None:
    try:
        await redis_set(key, json.dumps(value, ensure_ascii=False, default=_json_default), ttl)
    except Exception:
        pass


async def cache_set_many_json(values: dict[str, Any], ttl: int = PUBLIC_CATALOG_TTL_SECONDS) -> None:
    if not values:
        return
    try:
        redis = await get_redis()
        async with redis.pipeline(transaction=False) as pipe:
            for key, value in values.items():
                payload = json.dumps(value, ensure_ascii=False, default=_json_default)
                if ttl:
                    pipe.set(key, payload, ex=ttl)
                else:
                    pipe.set(key, payload)
            await pipe.execute()
    except Exception:
        pass


async def cache_get_hash_json(key: str, field: str) -> Any | None:
    try:
        redis = await get_redis()
        raw = await redis.hget(key, field)
        if not raw:
            return None
        return json.loads(raw)
    except Exception:
        return None


async def cache_set_hash_many_json(key: str, values: dict[str, Any], ttl: int = PUBLIC_CATALOG_TTL_SECONDS) -> None:
    if not values:
        return
    try:
        redis = await get_redis()
        mapping = {
            field: json.dumps(value, ensure_ascii=False, default=_json_default)
            for field, value in values.items()
        }
        async with redis.pipeline(transaction=False) as pipe:
            pipe.hset(key, mapping=mapping)
            if ttl:
                pipe.expire(key, ttl)
            await pipe.execute()
    except Exception:
        pass


async def invalidate_catalog_cache(
    product_ids: Iterable[int] | None = None,
    *,
    clear_categories: bool = False,
    clear_products: bool = True,
    clear_stock: bool = True,
) -> None:
    try:
        if clear_categories:
            await redis_delete(RedisKeys.categories_cache())
        if clear_products:
            await redis_delete_pattern(f"{RedisKeys.PREFIX}:products:list:*")
            await redis_delete_pattern(f"{RedisKeys.PREFIX}:products:category:*")
            await redis_delete(RedisKeys.products_by_category_hash())
        if clear_stock:
            await redis_delete_pattern(f"{RedisKeys.PREFIX}:stock:summary:*")

        ids = list(dict.fromkeys(pid for pid in (product_ids or []) if pid is not None))
        if ids:
            for product_id in ids:
                await redis_delete(RedisKeys.product_detail(int(product_id)))
        elif clear_products:
            await redis_delete_pattern(f"{RedisKeys.PREFIX}:product:*")
    except Exception:
        pass


async def invalidate_product_cache(product_id: int) -> None:
    await invalidate_catalog_cache(product_ids=[product_id], clear_products=True, clear_stock=True)
