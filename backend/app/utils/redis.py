from __future__ import annotations

from typing import Any, Optional
from redis.asyncio import Redis, ConnectionPool
from app.config import settings

_pool: Optional[ConnectionPool] = None
_client: Optional[Redis] = None


async def get_redis() -> Redis:
    global _pool, _client
    if _pool is None:
        _pool = ConnectionPool.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            max_connections=settings.REDIS_MAX_CONNECTIONS,
        )
    if _client is None:
        _client = Redis(connection_pool=_pool)
    return _client


async def close_redis() -> None:
    global _pool, _client
    if _client is not None:
        await _client.aclose()
        _client = None
    if _pool is not None:
        await _pool.disconnect()
        _pool = None


class RedisKeys:
    PREFIX = "kawang"

    @staticmethod
    def auth_token(user_id: int) -> str:
        return f"{RedisKeys.PREFIX}:auth:{user_id}"

    @staticmethod
    def refresh_token(user_id: int) -> str:
        return f"{RedisKeys.PREFIX}:auth:refresh:{user_id}"

    @staticmethod
    def email_code(email: str) -> str:
        return f"{RedisKeys.PREFIX}:email_code:{email.lower()}"

    @staticmethod
    def email_send_limit(email: str) -> str:
        return f"{RedisKeys.PREFIX}:email_send:{email.lower()}"

    @staticmethod
    def login_attempts(identifier: str) -> str:
        return f"{RedisKeys.PREFIX}:login_attempts:{identifier}"

    @staticmethod
    def categories_cache() -> str:
        return f"{RedisKeys.PREFIX}:categories:active"

    @staticmethod
    def products_list(category_id: int | None, q: str | None, offset: int, limit: int) -> str:
        category_part = "all" if category_id is None else str(category_id)
        query_part = (q or "").strip().lower() or "_"
        return f"{RedisKeys.PREFIX}:products:list:{category_part}:{offset}:{limit}:{query_part}"

    @staticmethod
    def products_by_category(category_id: int | None) -> str:
        category_part = "all" if category_id is None else str(category_id)
        return f"{RedisKeys.PREFIX}:products:category:{category_part}"

    @staticmethod
    def products_by_category_hash() -> str:
        return f"{RedisKeys.PREFIX}:products:category"

    @staticmethod
    def shop_cache() -> str:
        return f"{RedisKeys.PREFIX}:shop:config"

    @staticmethod
    def product_detail(product_id: int) -> str:
        return f"{RedisKeys.PREFIX}:product:{product_id}"

    @staticmethod
    def stock_summary(offset: int, limit: int) -> str:
        return f"{RedisKeys.PREFIX}:stock:summary:{offset}:{limit}"


async def redis_set(key: str, value: str, ttl: Optional[int] = None) -> None:
    r = await get_redis()
    if ttl:
        await r.set(key, value, ex=ttl)
    else:
        await r.set(key, value)


async def redis_get(key: str) -> Optional[str]:
    r = await get_redis()
    return await r.get(key)


async def redis_delete(key: str) -> bool:
    r = await get_redis()
    return await r.delete(key) > 0


async def redis_delete_pattern(pattern: str) -> int:
    r = await get_redis()
    keys = [key async for key in r.scan_iter(pattern)]
    if not keys:
        return 0
    return await r.delete(*keys)


async def redis_exists(key: str) -> bool:
    r = await get_redis()
    return await r.exists(key) > 0


async def redis_incr(key: str) -> int:
    r = await get_redis()
    return await r.incr(key)


async def redis_expire(key: str, ttl: int) -> bool:
    r = await get_redis()
    return await r.expire(key, ttl)


async def redis_ttl(key: str) -> int:
    r = await get_redis()
    return await r.ttl(key)
