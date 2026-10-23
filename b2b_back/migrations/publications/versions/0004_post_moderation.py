"""Published posts and later edits wait for moderation."""

import sqlalchemy as sa
from alembic import op

revision = "publications_0004"
down_revision = "publications_0003"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "posts",
        sa.Column("moderation_status", sa.String(length=16), nullable=True),
        schema="publications",
    )
    op.add_column("posts", sa.Column("draft", sa.JSON(), nullable=True), schema="publications")
    op.add_column(
        "posts", sa.Column("draft_status", sa.String(length=16), nullable=True), schema="publications"
    )
    op.add_column(
        "posts", sa.Column("rejection_reason", sa.Text(), nullable=True), schema="publications"
    )
    op.execute(
        "UPDATE publications.posts SET moderation_status = 'active' WHERE status = 'published'"
    )


def downgrade():
    op.drop_column("posts", "rejection_reason", schema="publications")
    op.drop_column("posts", "draft_status", schema="publications")
    op.drop_column("posts", "draft", schema="publications")
    op.drop_column("posts", "moderation_status", schema="publications")
