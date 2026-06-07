import enum
from datetime import datetime
from sqlalchemy import Boolean, DateTime, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

CODE_VALUE_MAX_LENGTH = 1000

class CodeKeyStatus(str, enum.Enum):
    UNUSED = "unused"
    RESERVED = "reserved"
    ASSIGNED = "assigned"
    REVOKED = "revoked"

class CodeKey(Base):
    __tablename__ = "code_key"
    __table_args__ = (
        Index("ix_code_key_product_status_deleted", "product_id", "status", "is_deleted"),
        Index("ix_code_key_status_deleted_product", "status", "is_deleted", "product_id"),
        Index("ix_code_key_order_status_deleted", "order_id", "status", "is_deleted"),
        Index("ix_code_key_product_deleted_id", "product_id", "is_deleted", "id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    product_id: Mapped[int] = mapped_column(Integer, nullable=False)
    code_value: Mapped[str] = mapped_column(String(CODE_VALUE_MAX_LENGTH), nullable=False)
    status: Mapped[CodeKeyStatus] = mapped_column(String(20), default=CodeKeyStatus.UNUSED, nullable=False, index=True)
    order_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reserved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    assigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
