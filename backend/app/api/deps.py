"""认证依赖注入模块。

提供 FastAPI 依赖注入函数，用于用户身份认证和权限校验。
"""

import logging
from time import perf_counter
from typing import Optional

from fastapi import Depends, Header, HTTPException, Request
from starlette.status import HTTP_401_UNAUTHORIZED, HTTP_403_FORBIDDEN, HTTP_429_TOO_MANY_REQUESTS
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.utils.security import decode_token
from app.utils.redis import RedisKeys, redis_expire, redis_get, redis_incr, redis_ttl

logger = logging.getLogger(__name__)
_admin_access_cache: dict[int, tuple[float, bool]] = {}
_ADMIN_ACCESS_CACHE_SECONDS = 15.0


def prime_admin_access_cache(user_id: int, allowed: bool = True) -> None:
    _admin_access_cache[user_id] = (perf_counter() + _ADMIN_ACCESS_CACHE_SECONDS, allowed)


async def get_current_user(
    request: Request,
    authorization: str = Header(..., description="Bearer {token}"),
) -> dict:
    """从 Header Authorization: Bearer {token} 中解码 JWT，
    校验 Redis 中该用户 token 是否有效，返回 payload 字典。

    Returns:
        dict: 包含 sub (user_id) 和 role 的 payload。

    Raises:
        HTTPException 401: token 无效、过期或 Redis 中不匹配。
    """
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(
            status_code=HTTP_401_UNAUTHORIZED,
            detail="Token 已过期或无效",
        )

    should_trace = request.url.path.endswith("/orders/mine")
    started_at = perf_counter()
    payload = decode_token(token)
    jwt_decode_ms = (perf_counter() - started_at) * 1000
    if payload is None:
        raise HTTPException(
            status_code=HTTP_401_UNAUTHORIZED,
            detail="Token 已过期或无效",
        )

    user_id: str = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=HTTP_401_UNAUTHORIZED,
            detail="Token 已过期或无效",
        )

    redis_started_at = perf_counter()
    stored_token = await redis_get(RedisKeys.auth_token(int(user_id)))
    redis_get_ms = (perf_counter() - redis_started_at) * 1000
    if stored_token is None or stored_token != token:
        raise HTTPException(
            status_code=HTTP_401_UNAUTHORIZED,
            detail="Token 已过期或无效",
        )

    if should_trace:
        logger.info(
            "[auth.timing] path=%s user_id=%s jwt_decode=%.2fms redis_token_get=%.2fms total=%.2fms",
            request.url.path,
            user_id,
            jwt_decode_ms,
            redis_get_ms,
            (perf_counter() - started_at) * 1000,
        )

    return payload


async def get_current_user_optional(
    authorization: Optional[str] = Header(None, description="Bearer {token}"),
) -> Optional[dict]:
    """可选的用户认证，Authorization header 不存在或无效时返回 None。

    Returns:
        dict | None: 校验通过时返回 payload，否则返回 None。
    """
    if authorization is None:
        return None

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None

    payload = decode_token(token)
    if payload is None:
        return None

    user_id: str = payload.get("sub")
    if not user_id:
        return None

    stored_token = await redis_get(RedisKeys.auth_token(int(user_id)))
    if stored_token is None or stored_token != token:
        return None

    return payload


async def get_current_admin(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """要求当前用户角色为 admin，否则返回 403。

    Returns:
        dict: 当前用户的 payload（已验证为 admin）。

    Raises:
        HTTPException 403: 角色不是 admin。
    """
    role: str = current_user.get("role", "")
    if role != "admin":
        raise HTTPException(
            status_code=HTTP_403_FORBIDDEN,
            detail="无操作权限",
        )
    user_id = int(current_user["sub"])
    now = perf_counter()
    cached = _admin_access_cache.get(user_id)
    if cached is not None and cached[0] > now:
        if cached[1]:
            return current_user
        raise HTTPException(
            status_code=HTTP_403_FORBIDDEN,
            detail="无操作权限",
        )

    user_row = (
        await db.execute(
            select(User.role, User.is_active).where(User.id == user_id)
        )
    ).one_or_none()
    allowed = user_row is not None and user_row.role == "admin" and user_row.is_active
    _admin_access_cache[user_id] = (now + _ADMIN_ACCESS_CACHE_SECONDS, allowed)
    if not allowed:
        raise HTTPException(
            status_code=HTTP_403_FORBIDDEN,
            detail="无操作权限",
        )
    return current_user


async def rate_limit_login(
    request: Request,
) -> dict:
    """基于 IP 的登录频率限制。

    从 request.client.host 获取 IP，在 Redis 中维护计数器。
    超过 5 次则返回 HTTP 429 及剩余冷却秒数。

    Returns:
        dict: {"key": "login_attempts:{ip}", "attempts": 当前计数}
              当未超过限制时返回。

    Raises:
        HTTPException 429: 超过限制，detail 中包含剩余等待秒数。
    """
    client_ip = request.client.host if request.client else "unknown"
    redis_key = f"login_attempts:{client_ip}"

    attempts = await redis_incr(redis_key)
    if attempts == 1:
        # 第一次尝试，设置过期时间为 15 分钟
        await redis_expire(redis_key, 900)

    if attempts >= 5:
        ttl = await redis_ttl(redis_key)
        raise HTTPException(
            status_code=HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "message": "登录尝试次数过多，请稍后再试",
                "remaining_seconds": max(ttl, 0),
            },
        )

    return {"key": redis_key, "attempts": attempts}
