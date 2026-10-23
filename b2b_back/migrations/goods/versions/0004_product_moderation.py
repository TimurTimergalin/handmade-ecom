"""New products and later edits wait for moderation."""

import sqlalchemy as sa
from alembic import op

revision = "goods_0004"
down_revision = "goods_0003"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "products",
        sa.Column("moderation_status", sa.String(length=16), nullable=True),
        schema="goods",
    )
    op.add_column("products", sa.Column("draft", sa.JSON(), nullable=True), schema="goods")
    op.add_column(
        "products", sa.Column("draft_status", sa.String(length=16), nullable=True), schema="goods"
    )
    op.add_column(
        "products", sa.Column("rejection_reason", sa.Text(), nullable=True), schema="goods"
    )
    op.execute("UPDATE goods.products SET moderation_status = 'active' WHERE moderation_status IS NULL")
    op.alter_column("products", "moderation_status", nullable=False, schema="goods")
    op.execute(
        "ALTER TABLE goods.products ADD CONSTRAINT ck_products_moderation_status "
        "CHECK (moderation_status IN ('pending','active','rejected'))"
    )
    op.execute(
        "ALTER TABLE goods.products ADD CONSTRAINT ck_products_draft_status "
        "CHECK (draft_status IS NULL OR draft_status IN ('pending','rejected'))"
    )


def downgrade():
    op.execute("ALTER TABLE goods.products DROP CONSTRAINT IF EXISTS ck_products_draft_status")
    op.execute("ALTER TABLE goods.products DROP CONSTRAINT IF EXISTS ck_products_moderation_status")
    op.drop_column("products", "rejection_reason", schema="goods")
    op.drop_column("products", "draft_status", schema="goods")
    op.drop_column("products", "draft", schema="goods")
    op.drop_column("products", "moderation_status", schema="goods")
