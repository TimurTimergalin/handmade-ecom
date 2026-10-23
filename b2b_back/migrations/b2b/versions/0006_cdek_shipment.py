"""Seller CDEK shipment office and weekdays."""

import sqlalchemy as sa
from alembic import op

revision = "b2b_0006"
down_revision = "b2b_0005"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "seller_delivery_settings",
        sa.Column("cdek_office_code", sa.String(length=32), nullable=True),
        schema="b2b",
    )
    op.add_column(
        "seller_delivery_settings",
        sa.Column("cdek_office_address", sa.Text(), nullable=True),
        schema="b2b",
    )
    op.add_column(
        "seller_delivery_settings",
        sa.Column("cdek_ship_days", sa.JSON(), nullable=True),
        schema="b2b",
    )
    op.execute(
        "UPDATE b2b.seller_delivery_settings SET cdek_office_code = '' WHERE cdek_office_code IS NULL"
    )
    op.execute(
        "UPDATE b2b.seller_delivery_settings SET cdek_office_address = '' WHERE cdek_office_address IS NULL"
    )
    op.execute(
        "UPDATE b2b.seller_delivery_settings SET cdek_ship_days = '[]' WHERE cdek_ship_days IS NULL"
    )
    op.alter_column("seller_delivery_settings", "cdek_office_code", nullable=False, schema="b2b")
    op.alter_column(
        "seller_delivery_settings", "cdek_office_address", nullable=False, schema="b2b"
    )
    op.alter_column("seller_delivery_settings", "cdek_ship_days", nullable=False, schema="b2b")


def downgrade():
    op.drop_column("seller_delivery_settings", "cdek_ship_days", schema="b2b")
    op.drop_column("seller_delivery_settings", "cdek_office_address", schema="b2b")
    op.drop_column("seller_delivery_settings", "cdek_office_code", schema="b2b")
