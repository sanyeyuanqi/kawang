"""add announcements

Revision ID: 20260607_add_announcements
Revises: 20260607_stock_summary_idx
Create Date: 2026-06-07 12:00:00.000000
"""

from datetime import datetime

import sqlalchemy as sa
from alembic import op


revision = "20260607_add_announcements"
down_revision = "20260607_stock_summary_idx"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "announcement",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("tag", sa.String(length=50), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_published", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_announcement")),
    )
    op.create_index(
        "ix_announcement_public_list",
        "announcement",
        ["is_published", "is_deleted", "sort_order", "id"],
        unique=False,
    )
    op.create_index(
        "ix_announcement_admin_list",
        "announcement",
        ["is_deleted", "updated_at", "id"],
        unique=False,
    )

    now = datetime(2026, 6, 4, 0, 0, 0)
    announcement_table = sa.table(
        "announcement",
        sa.column("title", sa.String),
        sa.column("tag", sa.String),
        sa.column("content", sa.Text),
        sa.column("sort_order", sa.Integer),
        sa.column("is_published", sa.Boolean),
        sa.column("published_at", sa.DateTime),
    )
    op.bulk_insert(
        announcement_table,
        [
            {
                "title": "自动发卡服务正常运行",
                "tag": "服务状态",
                "content": "店铺已开启自动发卡，付款完成后系统会自动发放卡密。请保存下单时填写的联系方式，方便后续查询订单。",
                "sort_order": 10,
                "is_published": True,
                "published_at": now,
            },
            {
                "title": "订单查询方式说明",
                "tag": "订单查询",
                "content": "无需登录也可以查询订单。进入订单查询页面后，输入订单号、手机号、邮箱、微信或 QQ 即可找回购买记录和卡密。",
                "sort_order": 20,
                "is_published": True,
                "published_at": now,
            },
            {
                "title": "售后处理提醒",
                "tag": "售后说明",
                "content": "如遇卡密无法使用、未收到卡密或支付状态异常，请保留下单信息并联系客服处理。",
                "sort_order": 30,
                "is_published": True,
                "published_at": now,
            },
        ],
    )


def downgrade() -> None:
    op.drop_index("ix_announcement_admin_list", table_name="announcement")
    op.drop_index("ix_announcement_public_list", table_name="announcement")
    op.drop_table("announcement")
