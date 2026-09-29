"""persist pasha api results

Revision ID: 43a39b93df16
Revises: 3f7c2a9d4b11
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "43a39b93df16"
down_revision: Union[str, Sequence[str], None] = "3f7c2a9d4b11"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "pasha_run_results",
        sa.Column(
            "id",
            sa.UUID(as_uuid=False),
            nullable=False,
        ),
        sa.Column(
            "analysis_id",
            sa.UUID(as_uuid=False),
            nullable=False,
        ),
        sa.Column(
            "result",
            sa.JSON(),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["analysis_id"],
            ["origin_analyses.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index(
        "idx_pasha_run_results_analysis_id",
        "pasha_run_results",
        ["analysis_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "idx_pasha_run_results_analysis_id",
        table_name="pasha_run_results",
    )

    op.drop_table("pasha_run_results")