import enum
from datetime import datetime
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

CODE_VALUE_MAX_LENGTH = 1000

class CodeKeyStatus(str, enum.Enum):
    UNUSED = "unused"
    RESERVED = "reserved"
    ASSIGNED = "assigned"
    REVOKED = "revoked"

class CodeKey(Base):
    __tablename__ = "code_key"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("product.id", ondelete="CASCADE"), nullable=False)
    code_value: Mapped[str] = mapped_column(String(CODE_VALUE_MAX_LENGTH), nullable=False)
    status: Mapped[CodeKeyStatus] = mapped_column(String(20), default=CodeKeyStatus.UNUSED, nullable=False, index=True)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("order.id", ondelete="SET NULL"), nullable=True)
    reserved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    assigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    product = relationship("Product", back_populates="code_keys")
    order = relationship("Order", backref="code_keys", lazy="selectin")
