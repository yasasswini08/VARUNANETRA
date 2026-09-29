"""add detection_run_results table (M1 restart-safety)

Revision ID: 9c3e6b1a2f47
Revises: 7a1f2c9e5d3b
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "9c3e6b1a2f47"
down_revision: Union[str, Sequence[str], None] = "7a1f2c9e5d3b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "detection_run_results",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("incident_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("scene_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("result", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["incident_id"], ["incidents.id"]),
        sa.ForeignKeyConstraint(["scene_id"], ["satellite_scenes.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_detection_run_results_incident_id", "detection_run_results", ["incident_id"], unique=False)


def downgrade() -> None:
    op.drop_index("idx_detection_run_results_incident_id", table_name="detection_run_results")
    op.drop_table("detection_run_results")
