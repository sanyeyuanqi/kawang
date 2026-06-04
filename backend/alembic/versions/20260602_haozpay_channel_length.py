"""extend haozpay pay channel length

Revision ID: 20260602_haozpay_channel_length
Revises: 15dc8beaa772
Create Date: 2026-06-02 13:40:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260602_haozpay_channel_length"
down_revision = "15dc8beaa772"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("order", "pay_channel", existing_type=sa.String(length=10), type_=sa.String(length=32), existing_nullable=True)


def downgrade() -> None:
    op.alter_column("order", "pay_channel", existing_type=sa.String(length=32), type_=sa.String(length=10), existing_nullable=True)
