from __future__ import annotations

from time import monotonic
from typing import Optional
from redis.asyncio import Redis, ConnectionPool
from app.config import settings

_pool: Optional[ConnectionPool] = None
_client: Optional[Redis] = None
_memory_store: dict[str, tuple[float | None, str]] = {}
_memory_counters: dict[str, tuple[float | None, int]] = {}
_redis_disabled_until = 0.0
_REDIS_RETRY_COOLDOWN_SECONDS = 30.0


def _is_expired(expires_at: float | None) -> bool:
    return expires_at is not None and expires_at <= monotonic()


def _memory_set(key: str, value: str, ttl: Optional[int] = None) -> None:
    expires_at = monotonic() + ttl if ttl else None
    _memory_store[key] = (expires_at, value)


def _memory_get(key: str) -> Optional[str]:
    item = _memory_store.get(key)
    if item is None:
        return None
    expires_at, value = item
    if _is_expired(expires_at):
        _memory_store.pop(key, None)
        return None
    return value


def _memory_delete(key: str) -> bool:
    deleted = key in _memory_store or key in _memory_counters
    _memory_store.pop(key, None)
    _memory_counters.pop(key, None)
    return deleted


def _memory_delete_pattern(pattern: str) -> int:
    from fnmatch import fnmatch

    keys = [key for key in _memory_store if fnmatch(key, pattern)]
    counter_keys = [key for key in _memory_counters if fnmatch(key, pattern)]
    for key in keys:
        _memory_store.pop(key, None)
    for key in counter_keys:
        _memory_counters.pop(key, None)
    return len(set(keys + counter_keys))


def _memory_exists(key: str) -> bool:
    return _memory_get(key) is not None or _memory_counter_get(key) is not None


def _memory_counter_get(key: str) -> Optional[int]:
    item = _memory_counters.get(key)
    if item is None:
        return None
    expires_at, value = item
    if _is_expired(expires_at):
        _memory_counters.pop(key, None)
        return None
    return value


def _memory_incr(key: str) -> int:
    item = _memory_counters.get(key)
    if item is None or _is_expired(item[0]):
        _memory_counters[key] = (None, 1)
        return 1
    expires_at, value = item
    next_value = value + 1
    _memory_counters[key] = (expires_at, next_value)
    return next_value


def _memory_expire(key: str, ttl: int) -> bool:
    expires_at = monotonic() + ttl
    if key in _memory_store:
        _memory_store[key] = (expires_at, _memory_store[key][1])
        return True
    if key in _memory_counters:
        _memory_counters[key] = (expires_at, _memory_counters[key][1])
        return True
    return False


def _memory_ttl(key: str) -> int:
    item = _memory_store.get(key) or _memory_counters.get(key)
    if item is None:
        return -2
    expires_at = item[0]
    if expires_at is None:
        return -1
    remaining = int(expires_at - monotonic())
    if remaining < 0:
        _memory_delete(key)
        return -2
    return remaining


def _redis_available() -> bool:
    return monotonic() >= _redis_disabled_until


def _mark_redis_error() -> None:
    global _redis_disabled_until
    _redis_disabled_until = monotonic() + _REDIS_RETRY_COOLDOWN_SECONDS


def mark_redis_unavailable() -> None:
    _mark_redis_error()


async def get_redis() -> Redis:
    global _pool, _client
    if _pool is None:
        _pool = ConnectionPool.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            max_connections=settings.REDIS_MAX_CONNECTIONS,
            socket_connect_timeout=0.2,
            socket_timeout=0.2,
            retry_on_timeout=False,
            health_check_interval=30,
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
    def pinned_announcement() -> str:
        return f"{RedisKeys.PREFIX}:announcement:pinned"

    @staticmethod
    def product_detail(product_id: int) -> str:
        return f"{RedisKeys.PREFIX}:product:{product_id}"

    @staticmethod
    def stock_summary(offset: int, limit: int) -> str:
        return f"{RedisKeys.PREFIX}:stock:summary:{offset}:{limit}"


async def redis_set(key: str, value: str, ttl: Optional[int] = None) -> None:
    _memory_set(key, value, ttl)
    if not _redis_available():
        return
    try:
        r = await get_redis()
        if ttl:
            await r.set(key, value, ex=ttl)
        else:
            await r.set(key, value)
    except Exception:
        _mark_redis_error()


async def redis_get(key: str) -> Optional[str]:
    cached = _memory_get(key)
    if cached is not None:
        return cached
    if not _redis_available():
        return None
    try:
        r = await get_redis()
        value = await r.get(key)
        if value is not None:
            return value
    except Exception:
        _mark_redis_error()
    return None


async def redis_delete(key: str) -> bool:
    memory_deleted = _memory_delete(key)
    if not _redis_available():
        return memory_deleted
    try:
        r = await get_redis()
        return await r.delete(key) > 0 or memory_deleted
    except Exception:
        _mark_redis_error()
        return memory_deleted


async def redis_delete_pattern(pattern: str) -> int:
    memory_deleted = _memory_delete_pattern(pattern)
    if not _redis_available():
        return memory_deleted
    try:
        r = await get_redis()
        keys = [key async for key in r.scan_iter(pattern)]
        if not keys:
            return memory_deleted
        return await r.delete(*keys) + memory_deleted
    except Exception:
        _mark_redis_error()
        return memory_deleted


async def redis_exists(key: str) -> bool:
    if _memory_exists(key):
        return True
    if not _redis_available():
        return False
    try:
        r = await get_redis()
        if await r.exists(key) > 0:
            return True
    except Exception:
        _mark_redis_error()
    return False


async def redis_incr(key: str) -> int:
    value = _memory_incr(key)
    if not _redis_available():
        return value
    try:
        r = await get_redis()
        redis_value = await r.incr(key)
        _memory_counters[key] = (_memory_counters.get(key, (None, 0))[0], int(redis_value))
        return int(redis_value)
    except Exception:
        _mark_redis_error()
        return value


async def redis_expire(key: str, ttl: int) -> bool:
    memory_updated = _memory_expire(key, ttl)
    if not _redis_available():
        return memory_updated
    try:
        r = await get_redis()
        return await r.expire(key, ttl) or memory_updated
    except Exception:
        _mark_redis_error()
        return memory_updated


async def redis_ttl(key: str) -> int:
    memory_ttl = _memory_ttl(key)
    if memory_ttl >= 0:
        return memory_ttl
    if not _redis_available():
        return memory_ttl
    try:
        r = await get_redis()
        ttl = await r.ttl(key)
        if ttl >= 0:
            return int(ttl)
    except Exception:
        _mark_redis_error()
    return memory_ttl
