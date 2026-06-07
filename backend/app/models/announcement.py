from datetime import datetime

from sqlalchemy import Boolean, DateTime, Index, Integer, String, Text, desc, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Announcement(Base):
    __table_args__ = (
        Index("ix_announcement_public_list", "is_published", "is_deleted", "sort_order", "id"),
        Index("ix_announcement_pinned_public", "is_pinned", "is_published", "is_deleted", "updated_at"),
        Index("ix_announcement_admin_list", "is_deleted", "updated_at", "id"),
        Index("ix_announcement_admin_sort", "is_deleted", "sort_order", desc("id")),
        Index("ix_announcement_admin_status_sort", "is_deleted", "is_published", "sort_order", desc("id")),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    tag: Mapped[str] = mapped_column(String(50), nullable=False, default="店铺公告")
    content: Mapped[str] = mapped_column(Text, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_published: Mapped[bool] = mapped_column(Boolean, default=True)
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
