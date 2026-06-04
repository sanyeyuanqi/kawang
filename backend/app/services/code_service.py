import logging
from datetime import datetime
from sqlalchemy import select, update, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.code_key import CodeKey, CodeKeyStatus

logger = logging.getLogger(__name__)


class InsufficientStockError(Exception):
    def __init__(self, message: str): self.message = message; super().__init__(message)


class CodeService:
    @staticmethod
    async def _product_ids_for_order(db: AsyncSession, order_id: int) -> list[int]:
        rows = await db.execute(
            select(CodeKey.product_id)
            .where(CodeKey.order_id == order_id, CodeKey.is_deleted == False)
            .distinct()
        )
        return [product_id for product_id in rows.scalars().all() if product_id is not None]

    @staticmethod
    async def _invalidate_products(product_ids: list[int]) -> None:
        if not product_ids:
            return
        from app.services.catalog_cache import invalidate_catalog_cache

        await invalidate_catalog_cache(product_ids=product_ids, clear_products=True, clear_stock=True)

    @staticmethod
    async def count_available(db: AsyncSession, product_id: int) -> int:
        stmt = select(func.count(CodeKey.id)).where(
            CodeKey.product_id == product_id, CodeKey.status == CodeKeyStatus.UNUSED, CodeKey.is_deleted == False)
        return (await db.execute(stmt)).scalar() or 0

    @staticmethod
    async def reserve_codes(db: AsyncSession, product_id: int, quantity: int, order_id: int) -> list[CodeKey]:
        stmt = (select(CodeKey).where(
            CodeKey.product_id == product_id, CodeKey.status == CodeKeyStatus.UNUSED, CodeKey.is_deleted == False)
            .order_by(CodeKey.id).limit(quantity).with_for_update(skip_locked=True))
        result = await db.execute(stmt)
        codes = result.scalars().all()
        if len(codes) < quantity:
            raise InsufficientStockError(f"库存不足，需要 {quantity} 张，可用 {len(codes)} 张")
        now = datetime.now()
        code_ids = [c.id for c in codes]
        update_result = await db.execute(update(CodeKey).where(
            CodeKey.id.in_(code_ids),
            CodeKey.status == CodeKeyStatus.UNUSED,
            CodeKey.is_deleted == False,
        ).values(
            status=CodeKeyStatus.RESERVED, reserved_at=now, order_id=order_id))
        if update_result.rowcount != quantity:
            raise InsufficientStockError("库存不足，请重新选择购买数量")
        await CodeService._invalidate_products([product_id])
        return codes

    @staticmethod
    async def confirm_codes(db: AsyncSession, order_id: int) -> int:
        product_ids = await CodeService._product_ids_for_order(db, order_id)
        now = datetime.now()
        result = await db.execute(update(CodeKey).where(
            CodeKey.order_id == order_id, CodeKey.status == CodeKeyStatus.RESERVED)
            .values(status=CodeKeyStatus.ASSIGNED, assigned_at=now))
        if result.rowcount:
            await CodeService._invalidate_products(product_ids)
        return result.rowcount

    @staticmethod
    async def release_codes(db: AsyncSession, order_id: int) -> int:
        product_ids = await CodeService._product_ids_for_order(db, order_id)
        result = await db.execute(update(CodeKey).where(
            CodeKey.order_id == order_id, CodeKey.status == CodeKeyStatus.RESERVED)
            .values(status=CodeKeyStatus.UNUSED, reserved_at=None, order_id=None))
        if result.rowcount:
            await CodeService._invalidate_products(product_ids)
        return result.rowcount

    @staticmethod
    async def revoke_codes(db: AsyncSession, order_id: int) -> int:
        product_ids = await CodeService._product_ids_for_order(db, order_id)
        result = await db.execute(update(CodeKey).where(
            CodeKey.order_id == order_id, CodeKey.status == CodeKeyStatus.ASSIGNED)
            .values(status=CodeKeyStatus.UNUSED, order_id=None, assigned_at=None))
        if result.rowcount:
            await CodeService._invalidate_products(product_ids)
        return result.rowcount
