"""YooKassa shop id used for split payments."""

import sqlalchemy as sa
from alembic import op

revision = "b2b_0005"
down_revision = "b2b_0004"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "seller_stores",
        sa.Column("yookassa_shop_id", sa.String(length=64), nullable=True),
        schema="b2b",
    )


def downgrade():
    op.drop_column("seller_stores", "yookassa_shop_id", schema="b2b")
