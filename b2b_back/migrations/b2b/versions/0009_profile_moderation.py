"""Queue public shop profile edits for moderation."""

import sqlalchemy as sa
from alembic import op

revision = "b2b_0009"
down_revision = "b2b_0008"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("seller_stores", sa.Column("profile_draft", sa.JSON(), nullable=True), schema="b2b")
    op.add_column(
        "seller_stores", sa.Column("profile_status", sa.String(length=16), nullable=True), schema="b2b"
    )
    op.add_column(
        "seller_stores",
        sa.Column("profile_rejection_reason", sa.Text(), nullable=True),
        schema="b2b",
    )


def downgrade():
    op.drop_column("seller_stores", "profile_rejection_reason", schema="b2b")
    op.drop_column("seller_stores", "profile_status", schema="b2b")
    op.drop_column("seller_stores", "profile_draft", schema="b2b")
