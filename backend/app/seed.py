from __future__ import annotations

import asyncio
from datetime import datetime
from decimal import Decimal

from sqlalchemy import select

from app.config import settings
from app.database import async_session_factory
from app.models.category import Category
from app.models.code_key import CodeKey, CodeKeyStatus
from app.models.order import Order, OrderStatus
from app.models.product import Product
from app.models.shop_config import ShopConfig
from app.models.user import User
from app.utils.security import hash_password

ADMIN_USERNAME = settings.ADMIN_USERNAME
ADMIN_PASSWORD = settings.ADMIN_PASSWORD


async def seed() -> None:
    async with async_session_factory() as db:
        shop = (await db.execute(select(ShopConfig).where(ShopConfig.id == 1))).scalar_one_or_none()
        if shop is None:
            db.add(ShopConfig(
                id=1,
                shop_name="小野卡铺",
                shop_slogan="自动发卡 · 售后在线 · 稳定靠谱",
                avatar_text="卡",
                contact_wechat="ylj3194584108",
                contact_qq="282212",
                is_open=True,
            ))
        else:
            shop.shop_name = "小野卡铺"
            shop.shop_slogan = "自动发卡 · 售后在线 · 稳定靠谱"
            shop.avatar_text = "卡"
            shop.contact_wechat = "ylj3194584108"
            shop.contact_qq = "282212"
            shop.is_open = True

        admin = (await db.execute(select(User).where(User.username == ADMIN_USERNAME))).scalar_one_or_none()
        if admin is None:
            db.add(User(
                username=ADMIN_USERNAME,
                email=None,
                phone=None,
                password_hash=hash_password(ADMIN_PASSWORD),
                role="admin",
                is_active=True,
            ))
        else:
            admin.password_hash = hash_password(ADMIN_PASSWORD)
            admin.role = "admin"
            admin.is_active = True

        other_admins = (await db.execute(select(User).where(User.role == "admin", User.username != ADMIN_USERNAME))).scalars().all()
        for user_to_demote in other_admins:
            user_to_demote.role = "buyer"

        categories = [
            ("会员卡券", "视频/音乐/网盘", 60),
            ("游戏充值", "Steam/点券/礼包", 50),
            ("软件授权", "工具/素材/插件", 40),
            ("学习资料", "课程/题库/资料包", 30),
            ("流量话费", "话费/流量包", 20),
            ("其他服务", "代充/兑换/定制", 10),
        ]
        category_map: dict[str, Category] = {}
        for name, subtitle, sort_order in categories:
            category = (await db.execute(select(Category).where(Category.name == name, Category.is_deleted == False))).scalar_one_or_none()
            if category is None:
                category = Category(name=name, subtitle=subtitle, sort_order=sort_order, is_active=True)
                db.add(category)
                await db.flush()
            else:
                category.subtitle = subtitle
                category.sort_order = sort_order
                category.is_active = True
            category_map[name] = category

        products = [
            ("视频会员月卡", "会员卡券", "自动发卡，可在订单查询页找回。", "https://example.com/redeem/video", Decimal("18.80"), 40),
            ("Steam 充值卡", "游戏充值", "Steam 钱包充值兑换码，付款后自动发货。", "https://store.steampowered.com/account/redeemwalletcode", Decimal("50.00"), 30),
            ("软件授权码", "软件授权", "常用效率工具授权码，支持在线激活。", "https://example.com/redeem/software", Decimal("29.90"), 20),
            ("学习资料包", "学习资料", "课程讲义、题库与素材压缩包兑换码。", "https://example.com/redeem/course", Decimal("9.90"), 10),
        ]
        product_map: dict[str, Product] = {}
        for name, category_name, description, usage_instructions, price, sort_order in products:
            product = (await db.execute(select(Product).where(Product.name == name, Product.is_deleted == False))).scalar_one_or_none()
            if product is None:
                product = Product(
                    category_id=category_map[category_name].id,
                    name=name,
                    description=description,
                    usage_instructions=usage_instructions,
                    price=price,
                    sort_order=sort_order,
                )
                db.add(product)
                await db.flush()
            else:
                product.category_id = category_map[category_name].id
                product.description = description
                product.usage_instructions = usage_instructions
                product.price = price
                product.sort_order = sort_order
            product_map[name] = product

        for product_name, product in product_map.items():
            existing_count = (await db.execute(select(CodeKey.id).where(CodeKey.product_id == product.id).limit(1))).scalar_one_or_none()
            if existing_count is None:
                prefix = "".join(ch for ch in product_name.upper() if ch.isascii() and ch.isalnum()) or f"P{product.id}"
                for index in range(1, 11):
                    db.add(CodeKey(
                        product_id=product.id,
                        code_value=f"{prefix}-DEMO-{index:03d}",
                        status=CodeKeyStatus.UNUSED,
                    ))

        user = (await db.execute(select(User).where(User.email == "buyer@example.com"))).scalar_one_or_none()
        if user is None:
            user = User(
                username="buyer_demo",
                email="buyer@example.com",
                phone="13800138000",
                password_hash=hash_password("Buyer123!"),
                role="buyer",
                is_active=True,
            )
            db.add(user)
            await db.flush()

        demo_order_no = "KWABCDEFGHJKLMNPQRSTUVWXYZ23456789"
        legacy_demo_order_nos = ["KW" + "202606020001", "KWDEMO" + "202606020001ABCDEFGHJKLMNPQR"]
        paid_order = (await db.execute(select(Order).where(Order.order_no == demo_order_no))).scalar_one_or_none()
        if paid_order is None:
            paid_order = (await db.execute(
                select(Order)
                .where(Order.order_no.in_(legacy_demo_order_nos))
                .order_by(Order.id.desc())
            )).scalars().first()
            if paid_order is not None:
                paid_order.order_no = demo_order_no
        if paid_order is None:
            paid_product = product_map["视频会员月卡"]
            paid_order = Order(
                order_no=demo_order_no,
                product_id=paid_product.id,
                product_name=paid_product.name,
                product_price=paid_product.price,
                quantity=1,
                total_amount=paid_product.price,
                user_id=user.id,
                contact_info="buyer@example.com",
                status=OrderStatus.PAID,
                haozpay_seq_id="DEBUG-SEQ-0001",
                pay_channel="alipay",
                paid_at=datetime.now(),
            )
            db.add(paid_order)
            await db.flush()
            code = (await db.execute(
                select(CodeKey)
                .where(CodeKey.product_id == paid_product.id, CodeKey.status == CodeKeyStatus.UNUSED)
                .order_by(CodeKey.id.asc())
                .limit(1)
            )).scalar_one_or_none()
            if code is not None:
                code.status = CodeKeyStatus.ASSIGNED
                code.order_id = paid_order.id
                code.assigned_at = datetime.now()

        await db.commit()


if __name__ == "__main__":
    asyncio.run(seed())
