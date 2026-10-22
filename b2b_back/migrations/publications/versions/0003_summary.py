"""Short description shown in the feed and search."""

import sqlalchemy as sa
from alembic import op

revision = "publications_0003"
down_revision = "publications_0002"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "posts",
        sa.Column("summary", sa.String(length=600), nullable=False, server_default=""),
        schema="publications",
    )


def downgrade():
    op.drop_column("posts", "summary", schema="publications")
