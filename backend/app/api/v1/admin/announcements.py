from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin
from app.api.v1.announcements import announcement_dict
from app.database import get_db
from app.models.announcement import Announcement
from app.services.catalog_cache import invalidate_announcement_cache

router = APIRouter()


class AnnouncementPayload(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    tag: str = Field(default="店铺公告", min_length=1, max_length=50)
    content: str = Field(min_length=1)
    sort_order: int = 0
    is_published: bool = True
    is_pinned: bool = False


class AnnouncementUpdatePayload(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    tag: str | None = Field(default=None, min_length=1, max_length=50)
    content: str | None = Field(default=None, min_length=1)
    sort_order: int | None = None
    is_published: bool | None = None
    is_pinned: bool | None = None


def _error(status_code: int, code: int, msg: str) -> None:
    from app.main import AppError

    raise AppError(code=code, msg=msg, status_code=status_code)


def _admin_announcement_dict(announcement: Announcement) -> dict[str, Any]:
    return {
        **announcement_dict(announcement),
        "is_published": announcement.is_published,
        "is_pinned": announcement.is_pinned,
    }


def _clean_required(value: str, field_name: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        _error(400, 400, f"{field_name}不能为空")
    return cleaned


def _search_condition(q: str | None):
    if not q:
        return None
    keyword = q.strip()
    if not keyword:
        return None
    like = f"%{keyword}%"
    return or_(
        Announcement.title.like(like),
        Announcement.tag.like(like),
        Announcement.content.like(like),
    )


def _base_conditions(q: str | None, status: str):
    conditions = [Announcement.is_deleted == False]
    search_condition = _search_condition(q)
    if search_condition is not None:
        conditions.append(search_condition)
    if status == "published":
        conditions.append(Announcement.is_published == True)
    elif status == "draft":
        conditions.append(Announcement.is_published == False)
    elif status != "all":
        _error(400, 400, "公告状态参数无效")
    return conditions


async def _get_announcement(db: AsyncSession, announcement_id: int) -> Announcement:
    announcement = (
        await db.execute(
            select(Announcement).where(
                Announcement.id == announcement_id,
                Announcement.is_deleted == False,
            )
        )
    ).scalar_one_or_none()
    if announcement is None:
        _error(404, 404, "公告不存在")
    return announcement


async def _unpin_other_announcements(db: AsyncSession, announcement_id: int | None = None) -> None:
    stmt = update(Announcement).where(
        Announcement.is_deleted == False,
        Announcement.is_pinned == True,
    )
    if announcement_id is not None:
        stmt = stmt.where(Announcement.id != announcement_id)
    await db.execute(stmt.values(is_pinned=False))


@router.get("/announcements")
async def list_announcements(
    _: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    q: str | None = Query(None),
    status: str = Query("all", pattern="^(all|published|draft)$"),
    offset: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
) -> dict[str, Any]:
    conditions = _base_conditions(q, status)
    stmt = (
        select(Announcement, func.count().over().label("total_count"))
        .where(*conditions)
        .order_by(Announcement.sort_order, Announcement.id.desc())
        .offset(offset)
        .limit(limit)
    )
    rows = (await db.execute(stmt)).all()
    total = int(rows[0].total_count) if rows else 0

    stats_stmt = (
        select(Announcement.is_published, func.count(Announcement.id))
        .where(*_base_conditions(q, "all"))
        .group_by(Announcement.is_published)
    )
    stats_rows = (await db.execute(stats_stmt)).all()
    status_counts = {bool(is_published): int(count) for is_published, count in stats_rows}
    stats = {
        "all": sum(status_counts.values()),
        "published": status_counts.get(True, 0),
        "draft": status_counts.get(False, 0),
    }
    return {
        "code": 200,
        "msg": "success",
        "data": {
            "items": [_admin_announcement_dict(row[0]) for row in rows],
            "total": total,
            "offset": offset,
            "limit": limit,
            "stats": stats,
        },
    }


@router.post("/announcements")
async def create_announcement(
    payload: AnnouncementPayload,
    _: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    data = payload.model_dump()
    data["title"] = _clean_required(data["title"], "公告标题")
    data["tag"] = _clean_required(data["tag"], "公告标签")
    data["content"] = _clean_required(data["content"], "公告内容")
    if data["is_pinned"]:
        data["is_published"] = True
    announcement = Announcement(
        **data,
        published_at=datetime.now() if data["is_published"] else None,
    )
    db.add(announcement)
    await db.flush()
    if announcement.is_pinned:
        await _unpin_other_announcements(db, announcement.id)
    await db.refresh(announcement)
    await invalidate_announcement_cache()
    return {"code": 200, "msg": "success", "data": _admin_announcement_dict(announcement)}


@router.put("/announcements/{announcement_id}")
async def update_announcement(
    announcement_id: int,
    payload: AnnouncementUpdatePayload,
    _: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    announcement = await _get_announcement(db, announcement_id)
    data = payload.model_dump(exclude_unset=True)
    field_names = {"title": "公告标题", "tag": "公告标签", "content": "公告内容"}
    for key, label in field_names.items():
        if key in data and data[key] is not None:
            data[key] = _clean_required(data[key], label)
    if data.get("is_published") is True and not announcement.is_published:
        announcement.published_at = datetime.now()
    elif data.get("is_published") is False:
        announcement.published_at = None
        data["is_pinned"] = False
    if data.get("is_pinned") is True and not (data.get("is_published") is True or announcement.is_published):
        data["is_published"] = True
        announcement.published_at = datetime.now()
    for key, value in data.items():
        setattr(announcement, key, value)
    await db.flush()
    if announcement.is_pinned:
        await _unpin_other_announcements(db, announcement.id)
        await db.flush()
    await db.refresh(announcement)
    await invalidate_announcement_cache()
    return {"code": 200, "msg": "success", "data": _admin_announcement_dict(announcement)}


@router.delete("/announcements/{announcement_id}")
async def delete_announcement(
    announcement_id: int,
    _: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    announcement = await _get_announcement(db, announcement_id)
    announcement.is_deleted = True
    announcement.is_published = False
    announcement.is_pinned = False
    announcement.published_at = None
    await db.flush()
    await invalidate_announcement_cache()
    return {"code": 200, "msg": "success", "data": None}
