"""unify admin into user role

Revision ID: 20260603_unify_admin_into_user
Revises: 20260602_haozpay_channel_length
Create Date: 2026-06-03 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260603_unify_admin_into_user"
down_revision = "20260602_haozpay_channel_length"
branch_labels = None
depends_on = None


ADMIN_USERNAME = "sanye"
ADMIN_PASSWORD_HASH = "$2b$12$hTX6TBFrZOvWkeBLRqbrQun/g.C9oTaLYTRe0JNKoBLPuNfuzhIHy"


def upgrade() -> None:
    op.add_column("user", sa.Column("role", sa.String(length=20), nullable=False, server_default="buyer"))

    bind = op.get_bind()
    bind.execute(
        sa.text(
            """
            INSERT INTO `user` (username, phone, email, password_hash, role, is_active, created_at, updated_at)
            VALUES (:username, NULL, NULL, :password_hash, 'admin', true, NOW(), NOW())
            ON DUPLICATE KEY UPDATE
              password_hash = VALUES(password_hash),
              role = 'admin',
              is_active = true,
              updated_at = NOW()
            """
        ),
        {"username": ADMIN_USERNAME, "password_hash": ADMIN_PASSWORD_HASH},
    )
    bind.execute(
        sa.text("UPDATE `user` SET role = 'buyer' WHERE role = 'admin' AND username <> :username"),
        {"username": ADMIN_USERNAME},
    )

    op.drop_table("admin_user")


def downgrade() -> None:
    op.create_table(
        "admin_user",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("username", sa.String(length=50), nullable=False),
        sa.Column("password_hash", sa.String(length=200), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_admin_user")),
        sa.UniqueConstraint("username", name=op.f("uq_admin_user_username")),
    )
    bind = op.get_bind()
    bind.execute(
        sa.text(
            """
            INSERT INTO admin_user (username, password_hash, created_at)
            SELECT username, password_hash, NOW() FROM `user` WHERE username = :username
            """
        ),
        {"username": ADMIN_USERNAME},
    )
    op.drop_column("user", "role")
