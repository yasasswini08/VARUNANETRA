"""
Every value that reaches the frontend or a report must carry a Provenance
record. This is not decorative: `Provenance.kind` is checked by
`reports/evidence_dossier.py` and by the frontend's data-quality banner, and
`assert_allowed_in_mode` is called at the point every provider returns data,
so a SYNTHETIC_DEMO record physically cannot reach a REAL-mode response
without an exception being raised first.
"""
from __future__ import annotations

import datetime as dt
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field

from app.config import AppMode
from app.core.exceptions import ModeIntegrityError


class DataKind(str, Enum):
    REAL = "REAL_DATA"
    DERIVED = "DERIVED_ANALYSIS"
    SYNTHETIC = "SYNTHETIC_DEMO"
    UNAVAILABLE = "UNAVAILABLE_DATA"


class Provenance(BaseModel):
    kind: DataKind
    source: str                       # e.g. "Copernicus Data Space Ecosystem"
    dataset: str | None = None        # e.g. "SENTINEL-1 GRD"
    product_id: str | None = None
    variable: str | None = None
    time_start: dt.datetime | None = None
    time_end: dt.datetime | None = None
    bbox: list[float] | None = None   # [minlon, minlat, maxlon, maxlat]
    source_url: str | None = None
    retrieved_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    processing_version: str | None = None
    model_version: str | None = None
    parameters: dict[str, Any] = Field(default_factory=dict)
    notes: str | None = None          # e.g. documented substitution rationale

    def assert_allowed_in_mode(self, mode: AppMode) -> "Provenance":
        if mode == AppMode.REAL and self.kind == DataKind.SYNTHETIC:
            raise ModeIntegrityError(
                f"Refusing to return SYNTHETIC_DEMO provenance ({self.source}) "
                f"while APP_MODE=real. This would violate the no-fake-fallback rule."
            )
        return self
