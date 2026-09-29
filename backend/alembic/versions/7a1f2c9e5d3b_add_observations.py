"""add observations table (SAR ingestion)

Revision ID: 7a1f2c9e5d3b
Revises: 468b29add87c
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from geoalchemy2 import Geometry


revision: str = "7a1f2c9e5d3b"
down_revision: Union[str, Sequence[str], None] = "468b29add87c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_geospatial_table(
        "observations",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("incident_id", sa.UUID(as_uuid=False), nullable=True),
        sa.Column("scene_id", sa.UUID(as_uuid=False), nullable=True),
        sa.Column("original_filename", sa.String(length=512), nullable=False),
        sa.Column("file_kind", sa.String(length=32), nullable=False),
        sa.Column("sensor", sa.String(length=64), nullable=True),
        sa.Column("product_id", sa.String(length=255), nullable=True),
        sa.Column("product_type", sa.String(length=32), nullable=True),
        sa.Column("acquisition_time", sa.DateTime(timezone=True), nullable=True),
        sa.Column("polarization", sa.String(length=16), nullable=True),
        sa.Column(
            "bbox",
            Geometry(geometry_type="POLYGON", srid=4326, dimension=2, spatial_index=False, from_text="ST_GeomFromEWKT", name="geometry", nullable=True),
            nullable=True,
        ),
        sa.Column("safe_dir", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("extraction_diagnostics", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["incident_id"], ["incidents.id"]),
        sa.ForeignKeyConstraint(["scene_id"], ["satellite_scenes.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_geospatial_index(
        "idx_observations_bbox", "observations", ["bbox"],
        unique=False, postgresql_using="gist", postgresql_ops={},
    )
    op.create_index("idx_observations_incident_id", "observations", ["incident_id"], unique=False)
    op.create_index("idx_observations_product_id", "observations", ["product_id"], unique=False)


def downgrade() -> None:
    op.drop_index("idx_observations_product_id", table_name="observations")
    op.drop_index("idx_observations_incident_id", table_name="observations")
    op.drop_geospatial_index("idx_observations_bbox", table_name="observations", postgresql_using="gist", column_name="bbox")
    op.drop_geospatial_table("observations")
