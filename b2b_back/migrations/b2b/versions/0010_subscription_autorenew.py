"""Saved YooKassa payment method and the unregistered renewal task id."""

import sqlalchemy as sa
from alembic import op

revision = "b2b_0010"
down_revision = "b2b_0009"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "seller_subscriptions",
        sa.Column("payment_method_id", sa.String(length=64), nullable=True),
        schema="b2b",
    )
    op.add_column(
        "seller_subscriptions",
        sa.Column("auto_renew", sa.Boolean(), nullable=False, server_default=sa.false()),
        schema="b2b",
    )
    op.add_column(
        "seller_subscriptions",
        sa.Column("renewal_task_id", sa.Uuid(), nullable=True),
        schema="b2b",
    )
    op.add_column(
        "seller_subscriptions",
        sa.Column(
            "renewal_registered", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        schema="b2b",
    )


def downgrade():
    op.drop_column("seller_subscriptions", "renewal_registered", schema="b2b")
    op.drop_column("seller_subscriptions", "renewal_task_id", schema="b2b")
    op.drop_column("seller_subscriptions", "auto_renew", schema="b2b")
    op.drop_column("seller_subscriptions", "payment_method_id", schema="b2b")
