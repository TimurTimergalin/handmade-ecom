"""Seller legal identity shown on the product card."""

import sqlalchemy as sa
from alembic import op

revision = "b2b_0007"
down_revision = "b2b_0006"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("seller_stores", sa.Column("legal_type", sa.String(length=16), nullable=True), schema="b2b")
    op.add_column("seller_stores", sa.Column("last_name", sa.String(length=100), nullable=True), schema="b2b")
    op.add_column("seller_stores", sa.Column("first_name", sa.String(length=100), nullable=True), schema="b2b")
    op.add_column("seller_stores", sa.Column("patronymic", sa.String(length=100), nullable=True), schema="b2b")
    op.add_column("seller_stores", sa.Column("legal_name", sa.String(length=300), nullable=True), schema="b2b")
    op.add_column("seller_stores", sa.Column("inn", sa.String(length=12), nullable=True), schema="b2b")
    op.add_column("seller_stores", sa.Column("ogrn", sa.String(length=15), nullable=True), schema="b2b")
    op.add_column("seller_stores", sa.Column("legal_address", sa.Text(), nullable=True), schema="b2b")


def downgrade():
    op.drop_column("seller_stores", "legal_address", schema="b2b")
    op.drop_column("seller_stores", "ogrn", schema="b2b")
    op.drop_column("seller_stores", "inn", schema="b2b")
    op.drop_column("seller_stores", "legal_name", schema="b2b")
    op.drop_column("seller_stores", "patronymic", schema="b2b")
    op.drop_column("seller_stores", "first_name", schema="b2b")
    op.drop_column("seller_stores", "last_name", schema="b2b")
    op.drop_column("seller_stores", "legal_type", schema="b2b")
