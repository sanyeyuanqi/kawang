from sqlalchemy import func, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product import Product
from app.services.catalog_cache import invalidate_catalog_cache


class ProductSalesService:
    @staticmethod
    async def increment_sold_count(db: AsyncSession, product_id: int, quantity: int) -> None:
        if quantity <= 0:
            return

        result = await db.execute(
            update(Product)
            .where(Product.id == product_id)
            .values(sold_count=func.coalesce(Product.sold_count, 0) + quantity)
        )
        if result.rowcount != 1:
            raise RuntimeError(f"商品不存在，无法更新销量: {product_id}")

        await invalidate_catalog_cache(
            product_ids=[product_id],
            clear_products=True,
            clear_stock=False,
        )
