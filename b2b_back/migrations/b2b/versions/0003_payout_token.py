"""Seller payout token for YooKassa Safe Deal."""

import sqlalchemy as sa
from alembic import op

revision = "b2b_0003"
down_revision = "b2b_0002"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "seller_stores",
        sa.Column("payout_token", sa.String(length=512), nullable=True),
        schema="b2b",
    )


def downgrade():
    op.drop_column("seller_stores", "payout_token", schema="b2b")
