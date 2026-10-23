"""Seller legal identity and shop moderation status."""

import sqlalchemy as sa
from alembic import op

revision = "b2b_0008"
down_revision = "b2b_0007"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "seller_stores",
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        schema="b2b",
    )
    op.execute(
        "ALTER TABLE b2b.seller_stores DROP CONSTRAINT IF EXISTS ck_seller_stores_onboarding_status"
    )
    op.execute(
        "ALTER TABLE b2b.seller_stores ADD CONSTRAINT ck_seller_stores_onboarding_status "
        "CHECK (onboarding_status IN ('pending','rejected','active'))"
    )


def downgrade():
    op.execute(
        "ALTER TABLE b2b.seller_stores DROP CONSTRAINT IF EXISTS ck_seller_stores_onboarding_status"
    )
    op.execute(
        "ALTER TABLE b2b.seller_stores ADD CONSTRAINT ck_seller_stores_onboarding_status "
        "CHECK (onboarding_status IN ('pending','active'))"
    )
    op.drop_column("seller_stores", "rejection_reason", schema="b2b")
