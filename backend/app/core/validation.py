from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, model_validator


class BBoxValidationMixin(BaseModel):
    minlon: float
    minlat: float
    maxlon: float
    maxlat: float

    @model_validator(mode="after")
    def validate_bbox(self):
        if not -180 <= self.minlon <= 180:
            raise ValueError("minlon must be between -180 and 180")

        if not -180 <= self.maxlon <= 180:
            raise ValueError("maxlon must be between -180 and 180")

        if not -90 <= self.minlat <= 90:
            raise ValueError("minlat must be between -90 and 90")

        if not -90 <= self.maxlat <= 90:
            raise ValueError("maxlat must be between -90 and 90")

        if self.minlon >= self.maxlon:
            raise ValueError("minlon must be less than maxlon")

        if self.minlat >= self.maxlat:
            raise ValueError("minlat must be less than maxlat")

        return self


def validate_time_range(start: datetime, end: datetime) -> None:
    if start > end:
        raise ValueError("start must be before or equal to end")


def validate_uuid_filter(value: str | None, field_name: str = "incident_id") -> None:
    """Query-param UUID filters (e.g. ?incident_id=...) reach the DB layer
    as a raw string; an ill-formed one otherwise surfaces as an unguarded
    500 from the UUID column cast rather than a clear 422. Used by new
    listing endpoints (observations, PASHA history) that filter on a UUID
    foreign key. Raises fastapi.HTTPException directly (not ValueError)
    since this runs inside a route handler, not a pydantic validator."""
    if value is None:
        return
    import uuid as _uuid

    from fastapi import HTTPException
    try:
        _uuid.UUID(value)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"{field_name} must be a valid UUID.")


def validate_coordinate(lon: float, lat: float) -> None:
    if not -180 <= lon <= 180:
        raise ValueError("longitude must be between -180 and 180")

    if not -90 <= lat <= 90:
        raise ValueError("latitude must be between -90 and 90")
