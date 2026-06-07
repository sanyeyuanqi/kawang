from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.announcement import Announcement
from app.services.catalog_cache import PUBLIC_CATALOG_TTL_SECONDS, cache_get_json, cache_set_json
from app.utils.redis import RedisKeys

router = APIRouter()
EMPTY_PINNED_ANNOUNCEMENT_CACHE = {"__empty_pinned_announcement__": True}


def announcement_dict(announcement: Announcement) -> dict[str, Any]:
    return {
        "id": announcement.id,
        "title": announcement.title,
        "tag": announcement.tag,
        "content": announcement.content,
        "sort_order": announcement.sort_order,
        "is_pinned": announcement.is_pinned,
        "published_at": announcement.published_at.strftime("%Y-%m-%d %H:%M:%S") if announcement.published_at else None,
        "created_at": announcement.created_at.strftime("%Y-%m-%d %H:%M:%S") if announcement.created_at else None,
        "updated_at": announcement.updated_at.strftime("%Y-%m-%d %H:%M:%S") if announcement.updated_at else None,
    }


@router.get("/announcements/pinned")
async def pinned_announcement(db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    cached = await cache_get_json(RedisKeys.pinned_announcement())
    if cached is not None:
        if isinstance(cached, dict) and cached.get("__empty_pinned_announcement__"):
            return {"code": 200, "msg": "success", "data": None}
        return {"code": 200, "msg": "success", "data": cached}

    item = (
        await db.execute(
            select(Announcement)
            .where(
                Announcement.is_pinned == True,
                Announcement.is_published == True,
                Announcement.is_deleted == False,
            )
            .order_by(Announcement.updated_at.desc(), Announcement.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    data = announcement_dict(item) if item else None
    await cache_set_json(
        RedisKeys.pinned_announcement(),
        data if data is not None else EMPTY_PINNED_ANNOUNCEMENT_CACHE,
        PUBLIC_CATALOG_TTL_SECONDS,
    )
    return {"code": 200, "msg": "success", "data": data}


@router.get("/announcements")
async def list_public_announcements(db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    stmt = (
        select(Announcement)
        .where(
            Announcement.is_published == True,
            Announcement.is_deleted == False,
        )
        .order_by(Announcement.is_pinned.desc(), Announcement.sort_order, Announcement.published_at.desc(), Announcement.id.desc())
    )
    items = (await db.execute(stmt)).scalars().all()
    return {"code": 200, "msg": "success", "data": [announcement_dict(item) for item in items]}
