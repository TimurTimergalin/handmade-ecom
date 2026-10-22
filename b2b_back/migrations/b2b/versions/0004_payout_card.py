"""Masked card details returned by the YooKassa payout widget."""

import sqlalchemy as sa
from alembic import op

revision = "b2b_0004"
down_revision = "b2b_0003"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "seller_stores",
        sa.Column("payout_card", sa.JSON(), nullable=True),
        schema="b2b",
    )


def downgrade():
    op.drop_column("seller_stores", "payout_card", schema="b2b")
