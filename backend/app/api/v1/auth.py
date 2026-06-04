from __future__ import annotations

import random
import re
from typing import Any

from fastapi import APIRouter, Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from sqlalchemy import select

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.api.deps import get_current_user
from app.services.email_service import EmailDeliveryError, email_service
from app.utils.redis import (
    RedisKeys,
    redis_delete,
    redis_exists,
    redis_expire,
    redis_get,
    redis_incr,
    redis_set,
    redis_ttl,
)
from app.utils.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)

router = APIRouter()
security = HTTPBearer(auto_error=False)

# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------


class SendCodeRequest(BaseModel):
    email: str
    purpose: str  # "register" | "reset_password"


class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str
    code: str


class LoginRequest(BaseModel):
    account: str
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class ResetPasswordRequest(BaseModel):
    email: str
    code: str
    new_password: str


class UpdateUserRequest(BaseModel):
    username: str | None = None


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _error(status_code: int, code: int, msg: str) -> None:
    """Lazy-import AppError to avoid circular imports with ``app.main``."""
    from app.main import AppError

    raise AppError(code=code, msg=msg, status_code=status_code)


def _validate_password(password: str) -> str | None:
    """Return an error message if the password is weak, else ``None``."""
    if len(password) < 8:
        return "密码必须包含大小写字母和数字"
    if not re.search(r"[a-z]", password):
        return "密码必须包含大小写字母和数字"
    if not re.search(r"[A-Z]", password):
        return "密码必须包含大小写字母和数字"
    if not re.search(r"\d", password):
        return "密码必须包含大小写字母和数字"
    return None


async def _get_user_by_email_or_username(db: Any, identifier: str) -> User | None:
    """Look up a user by email, phone, or username."""
    result = await db.execute(
        select(User).where(
            (User.email == identifier) | (User.phone == identifier) | (User.username == identifier)
        )
    )
    return result.scalar_one_or_none()


def _build_user_response(user: User) -> dict[str, Any]:
    return {
        "id": user.id,
        "username": user.username,
        "phone": user.phone,
        "email": user.email,
        "role": user.role or "buyer",
        "is_active": user.is_active,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "updated_at": user.updated_at.isoformat() if user.updated_at else None,
    }


# ---------------------------------------------------------------------------
# POST /api/v1/auth/send-code
# ---------------------------------------------------------------------------


@router.post("/auth/send-code")
async def auth_send_code(req: SendCodeRequest) -> dict[str, Any]:
    email = req.email.strip().lower()
    purpose = req.purpose

    if purpose not in ("register", "reset_password"):
        _error(400, 400, "无效的验证码用途")

    # 60-second cooldown for the same email
    limit_key = RedisKeys.email_send_limit(email)
    if await redis_exists(limit_key):
        remaining = await redis_ttl(limit_key)
        _error(429, 429, f"请{remaining}秒后再试")

    # Generate 6-digit random code
    code = f"{random.randint(0, 999999):06d}"

    # Store in Redis with 5-minute TTL
    code_key = RedisKeys.email_code(email)
    await redis_set(code_key, code, ttl=settings.EMAIL_CODE_EXPIRE_SECONDS)

    # Set 60-second send limit
    await redis_set(limit_key, "1", ttl=60)

    # Dispatch email asynchronously
    try:
        await email_service.send_verification_code(email, code)
    except EmailDeliveryError as exc:
        await redis_delete(code_key)
        await redis_delete(limit_key)
        _error(exc.status_code, exc.status_code, exc.message)

    return {
        "code": 200,
        "msg": "success",
        "data": {
            "message": "验证码已发送",
            "email": email,
        },
    }


# ---------------------------------------------------------------------------
# POST /api/v1/auth/register
# ---------------------------------------------------------------------------


@router.post("/auth/register")
async def auth_register(
    req: RegisterRequest,
    db=Depends(get_db),
) -> dict[str, Any]:
    # --- validate password strength ---
    pwd_err = _validate_password(req.password)
    if pwd_err:
        _error(400, 400, pwd_err)

    email = req.email.strip().lower()

    # --- verify email code ---
    code_key = RedisKeys.email_code(email)
    stored_code = await redis_get(code_key)
    if stored_code is None or stored_code != req.code.strip():
        _error(400, 400, "验证码错误或已过期")

    # --- check email uniqueness ---
    result = await db.execute(select(User).where(User.email == email))
    if result.scalar_one_or_none():
        _error(409, 409, "该邮箱已注册")

    # --- check username uniqueness ---
    result = await db.execute(
        select(User).where(User.username == req.username.strip())
    )
    if result.scalar_one_or_none():
        _error(409, 409, "该用户名已注册")

    # --- create user ---
    user = User(
        username=req.username.strip(),
        email=email,
        password_hash=hash_password(req.password),
        role="buyer",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)

    # --- clean up used code ---
    await redis_delete(code_key)

    # --- issue tokens ---
    role = user.role or "buyer"
    access_token = create_access_token(user.id, role)
    refresh_token = create_refresh_token(user.id, role)

    access_ttl = settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60
    refresh_ttl = settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600
    await redis_set(RedisKeys.auth_token(user.id), access_token, ttl=access_ttl)
    await redis_set(RedisKeys.refresh_token(user.id), refresh_token, ttl=refresh_ttl)

    return {
        "code": 200,
        "msg": "success",
        "data": {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "user": _build_user_response(user),
        },
    }


# ---------------------------------------------------------------------------
# POST /api/v1/auth/login
# ---------------------------------------------------------------------------


@router.post("/auth/login")
async def auth_login(
    req: LoginRequest,
    db=Depends(get_db),
) -> dict[str, Any]:
    identifier = req.account.strip().lower()

    # --- rate limiting ---
    attempts_key = RedisKeys.login_attempts(identifier)
    attempts = await redis_incr(attempts_key)
    if attempts == 1:
        await redis_expire(attempts_key, settings.LOGIN_ATTEMPT_WINDOW_SECONDS)

    if attempts > settings.LOGIN_ATTEMPT_LIMIT:
        _error(429, 429, "登录尝试次数过多，请5分钟后再试")

    user = await _get_user_by_email_or_username(db, identifier)
    if user is None or not verify_password(req.password, user.password_hash):
        _error(401, 401, "账号或密码错误")

    if not user.is_active:
        _error(403, 403, "账号已被禁用")

    # Clear attempt counter on success
    await redis_delete(attempts_key)

    # --- issue tokens ---
    role = user.role or "buyer"
    access_token = create_access_token(user.id, role)
    refresh_token = create_refresh_token(user.id, role)

    access_ttl = settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60
    refresh_ttl = settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600
    await redis_set(RedisKeys.auth_token(user.id), access_token, ttl=access_ttl)
    await redis_set(RedisKeys.refresh_token(user.id), refresh_token, ttl=refresh_ttl)

    return {
        "code": 200,
        "msg": "success",
        "data": {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "user": _build_user_response(user),
        },
    }


# ---------------------------------------------------------------------------
# POST /api/v1/auth/refresh
# ---------------------------------------------------------------------------


@router.post("/auth/refresh")
async def auth_refresh(req: RefreshRequest, db=Depends(get_db)) -> dict[str, Any]:
    payload = decode_token(req.refresh_token)
    if payload is None:
        _error(401, 401, "无效的刷新令牌")

    user_id = int(payload["sub"])
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None or not user.is_active:
        _error(401, 401, "用户不存在或已被禁用")
    role = user.role or "buyer"

    # Verify refresh token is still valid in Redis
    stored_token = await redis_get(RedisKeys.refresh_token(user_id))
    if stored_token is None or stored_token != req.refresh_token:
        _error(401, 401, "刷新令牌已过期或无效")

    new_access_token = create_access_token(user_id, role)
    await redis_set(
        RedisKeys.auth_token(user_id),
        new_access_token,
        ttl=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )

    return {
        "code": 200,
        "msg": "success",
        "data": {
            "access_token": new_access_token,
            "token_type": "bearer",
        },
    }


@router.post("/auth/reset-password")
async def auth_reset_password(req: ResetPasswordRequest, db=Depends(get_db)) -> dict[str, Any]:
    email = req.email.strip().lower()
    code_key = RedisKeys.email_code(email)
    stored_code = await redis_get(code_key)
    if stored_code is None or stored_code != req.code.strip():
        _error(400, 400, "验证码错误或已过期")
    pwd_err = _validate_password(req.new_password)
    if pwd_err:
        _error(400, 400, pwd_err)
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user is None:
        _error(404, 404, "用户不存在")
    user.password_hash = hash_password(req.new_password)
    await redis_delete(code_key)
    await redis_delete(RedisKeys.auth_token(user.id))
    await redis_delete(RedisKeys.refresh_token(user.id))
    return {"code": 200, "msg": "success", "data": None}


@router.get("/users/me")
async def get_me(current_user: dict = Depends(get_current_user), db=Depends(get_db)) -> dict[str, Any]:
    user = (await db.execute(select(User).where(User.id == int(current_user["sub"])))).scalar_one_or_none()
    if user is None:
        _error(404, 404, "用户不存在")
    return {"code": 200, "msg": "success", "data": _build_user_response(user)}


@router.put("/users/me")
async def update_me(req: UpdateUserRequest, current_user: dict = Depends(get_current_user), db=Depends(get_db)) -> dict[str, Any]:
    if current_user.get("role") == "admin":
        _error(403, 403, "管理员资料暂不支持在买家接口修改")

    user = (await db.execute(select(User).where(User.id == int(current_user["sub"])))).scalar_one_or_none()
    if user is None:
        _error(404, 404, "用户不存在")
    if req.username is not None:
        username = req.username.strip()
        if len(username) < 3:
            _error(400, 400, "用户名至少3个字符")
        exists = (await db.execute(select(User).where(User.username == username, User.id != user.id))).scalar_one_or_none()
        if exists:
            _error(409, 409, "该用户名已注册")
        user.username = username
    await db.flush()
    return {"code": 200, "msg": "success", "data": _build_user_response(user)}


# ---------------------------------------------------------------------------
# POST /api/v1/auth/logout
# ---------------------------------------------------------------------------


@router.post("/auth/logout")
async def auth_logout(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict[str, Any]:
    if credentials is None:
        _error(401, 401, "未提供认证令牌")

    token = credentials.credentials
    payload = decode_token(token)
    if payload is None:
        _error(401, 401, "无效的访问令牌")

    user_id = int(payload["sub"])
    await redis_delete(RedisKeys.auth_token(user_id))
    await redis_delete(RedisKeys.refresh_token(user_id))

    return {
        "code": 200,
        "msg": "success",
        "data": None,
    }
