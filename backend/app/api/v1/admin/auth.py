from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.api.deps import get_current_admin
from app.models.user import User
from app.utils.redis import RedisKeys, redis_delete, redis_set
from app.utils.security import create_access_token, create_refresh_token, verify_password

router = APIRouter()


class AdminLoginRequest(BaseModel):
    username: str
    password: str


def _error(status_code: int, code: int, msg: str) -> None:
    from app.main import AppError

    raise AppError(code=code, msg=msg, status_code=status_code)


@router.post("/login")
async def admin_login(req: AdminLoginRequest, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    result = await db.execute(select(User).where(User.username == req.username.strip(), User.role == "admin"))
    admin = result.scalar_one_or_none()
    if admin is None or not admin.is_active or not verify_password(req.password, admin.password_hash):
        _error(401, 401, "管理员账号或密码错误")

    access_token = create_access_token(admin.id, "admin")
    refresh_token = create_refresh_token(admin.id, "admin")
    await redis_set(
        RedisKeys.auth_token(admin.id),
        access_token,
        ttl=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )
    await redis_set(
        RedisKeys.refresh_token(admin.id),
        refresh_token,
        ttl=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600,
    )

    return {
        "code": 200,
        "msg": "success",
        "data": {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "admin": {"id": admin.id, "username": admin.username, "role": "admin"},
        },
    }


@router.post("/logout")
async def admin_logout(current_admin: dict = Depends(get_current_admin)) -> dict[str, Any]:
    admin_id = int(current_admin["sub"])
    await redis_delete(RedisKeys.auth_token(admin_id))
    await redis_delete(RedisKeys.refresh_token(admin_id))
    return {"code": 200, "msg": "success", "data": None}
