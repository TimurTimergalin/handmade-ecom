"""Ordered product image URLs. Cover `image` stays the first URL."""

import sqlalchemy as sa
from alembic import op

revision = "goods_0003"
down_revision = "goods_0002"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("products", sa.Column("images", sa.JSON(), nullable=True), schema="goods")
    op.execute(
        """
        UPDATE goods.products
        SET images = json_build_array(image)
        WHERE images IS NULL
           OR images::text IN ('[]', 'null')
        """
    )
    op.alter_column("products", "images", nullable=False, schema="goods")


def downgrade():
    op.drop_column("products", "images", schema="goods")
