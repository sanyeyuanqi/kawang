from __future__ import annotations

import json
from fnmatch import fnmatch
from time import monotonic
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Iterable

from app.utils.redis import RedisKeys, get_redis, redis_delete, redis_delete_pattern, redis_get, redis_set

PUBLIC_CATALOG_TTL_SECONDS = 300
STOCK_CACHE_TTL_SECONDS = 120
_memory_cache: dict[str, tuple[float, Any]] = {}
_memory_hash_cache: dict[str, dict[str, tuple[float, Any]]] = {}


def _json_default(value: Any) -> str:
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value.strftime("%Y-%m-%d %H:%M:%S")
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


def _memory_get(key: str) -> Any | None:
    item = _memory_cache.get(key)
    if item is None:
        return None
    expires_at, value = item
    if expires_at <= monotonic():
        _memory_cache.pop(key, None)
        return None
    return value


def _memory_set(key: str, value: Any, ttl: int) -> None:
    _memory_cache[key] = (monotonic() + ttl, value)


def _memory_hash_get(key: str, field: str) -> Any | None:
    item = _memory_hash_cache.get(key, {}).get(field)
    if item is None:
        return None
    expires_at, value = item
    if expires_at <= monotonic():
        _memory_hash_cache.get(key, {}).pop(field, None)
        return None
    return value


def _memory_hash_set_many(key: str, values: dict[str, Any], ttl: int) -> None:
    expires_at = monotonic() + ttl
    bucket = _memory_hash_cache.setdefault(key, {})
    for field, value in values.items():
        bucket[field] = (expires_at, value)


def _memory_delete(key: str) -> None:
    _memory_cache.pop(key, None)
    _memory_hash_cache.pop(key, None)


def _memory_delete_pattern(pattern: str) -> None:
    for key in list(_memory_cache):
        if fnmatch(key, pattern):
            _memory_cache.pop(key, None)
    for key in list(_memory_hash_cache):
        if fnmatch(key, pattern):
            _memory_hash_cache.pop(key, None)


async def cache_get_json(key: str) -> Any | None:
    cached = _memory_get(key)
    if cached is not None:
        return cached
    try:
        raw = await redis_get(key)
        if not raw:
            return None
        value = json.loads(raw)
        _memory_set(key, value, PUBLIC_CATALOG_TTL_SECONDS)
        return value
    except Exception:
        return _memory_get(key)


async def cache_set_json(key: str, value: Any, ttl: int = PUBLIC_CATALOG_TTL_SECONDS) -> None:
    _memory_set(key, value, ttl)
    try:
        await redis_set(key, json.dumps(value, ensure_ascii=False, default=_json_default), ttl)
    except Exception:
        pass


async def cache_set_many_json(values: dict[str, Any], ttl: int = PUBLIC_CATALOG_TTL_SECONDS) -> None:
    if not values:
        return
    for key, value in values.items():
        _memory_set(key, value, ttl)
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
    cached = _memory_hash_get(key, field)
    if cached is not None:
        return cached
    try:
        redis = await get_redis()
        raw = await redis.hget(key, field)
        if not raw:
            return None
        value = json.loads(raw)
        _memory_hash_set_many(key, {field: value}, PUBLIC_CATALOG_TTL_SECONDS)
        return value
    except Exception:
        return _memory_hash_get(key, field)


async def cache_set_hash_many_json(key: str, values: dict[str, Any], ttl: int = PUBLIC_CATALOG_TTL_SECONDS) -> None:
    if not values:
        return
    _memory_hash_set_many(key, values, ttl)
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
    if clear_categories:
        _memory_delete(RedisKeys.categories_cache())
    if clear_products:
        _memory_delete_pattern(f"{RedisKeys.PREFIX}:products:list:*")
        _memory_delete_pattern(f"{RedisKeys.PREFIX}:products:category:*")
        _memory_delete(RedisKeys.products_by_category_hash())
    if clear_stock:
        _memory_delete_pattern(f"{RedisKeys.PREFIX}:stock:summary:*")

    ids = list(dict.fromkeys(pid for pid in (product_ids or []) if pid is not None))
    if ids:
        for product_id in ids:
            _memory_delete(RedisKeys.product_detail(int(product_id)))
    elif clear_products:
        _memory_delete_pattern(f"{RedisKeys.PREFIX}:product:*")

    try:
        if clear_categories:
            await redis_delete(RedisKeys.categories_cache())
        if clear_products:
            await redis_delete_pattern(f"{RedisKeys.PREFIX}:products:list:*")
            await redis_delete_pattern(f"{RedisKeys.PREFIX}:products:category:*")
            await redis_delete(RedisKeys.products_by_category_hash())
        if clear_stock:
            await redis_delete_pattern(f"{RedisKeys.PREFIX}:stock:summary:*")

        if ids:
            for product_id in ids:
                await redis_delete(RedisKeys.product_detail(int(product_id)))
        elif clear_products:
            await redis_delete_pattern(f"{RedisKeys.PREFIX}:product:*")
    except Exception:
        pass


async def invalidate_product_cache(product_id: int) -> None:
    await invalidate_catalog_cache(product_ids=[product_id], clear_products=True, clear_stock=True)


async def invalidate_announcement_cache() -> None:
    _memory_delete(RedisKeys.pinned_announcement())
    try:
        await redis_delete(RedisKeys.pinned_announcement())
    except Exception:
        pass
