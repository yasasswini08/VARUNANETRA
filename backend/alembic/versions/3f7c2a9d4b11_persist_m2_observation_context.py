"""persist m2 observation context

Revision ID: 3f7c2a9d4b11
Revises: 2154987c781c
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from geoalchemy2 import Geometry


revision: str = "3f7c2a9d4b11"
down_revision: Union[str, Sequence[str], None] = "2154987c781c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "origin_analyses",
        sa.Column(
            "observation_time",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )

    op.add_column(
        "origin_analyses",
        sa.Column(
            "observed_slick_geometry",
            Geometry(geometry_type="POLYGON", srid=4326),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column(
        "origin_analyses",
        "observed_slick_geometry",
    )

    op.drop_column(
        "origin_analyses",
        "observation_time",
    )
