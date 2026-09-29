"""persist m2 environmental provenance

Revision ID: 468b29add87c
Revises: 43a39b93df16
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "468b29add87c"
down_revision: Union[str, Sequence[str], None] = "43a39b93df16"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "origin_analyses",
        sa.Column(
            "provenance",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'::json"),
        ),
    )


def downgrade() -> None:
    op.drop_column("origin_analyses", "provenance")
