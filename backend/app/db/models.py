"""
PostGIS-aware ORM models (spec section 6).

Geometry columns use SRID 4326 throughout. `metadata`/`parameters`/`reasons`
JSON columns exist specifically to store Provenance.model_dump() payloads --
every row that can be traced to an external dataset carries one.
"""
from __future__ import annotations

import datetime as dt
import uuid
from sqlalchemy import JSON

from geoalchemy2 import Geometry
from sqlalchemy import (
    Boolean, DateTime, Float, ForeignKey, Integer, JSON, String, Text, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


def uid() -> str:
    return str(uuid.uuid4())


class Incident(Base):
    __tablename__ = "incidents"
    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(255))
    bbox: Mapped[object] = mapped_column(Geometry("POLYGON", srid=4326))
    status: Mapped[str] = mapped_column(String(32), default="open")
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=lambda: dt.datetime.now(dt.timezone.utc))

    scenes: Mapped[list["SatelliteScene"]] = relationship(back_populates="incident")
    detections: Mapped[list["SpillDetection"]] = relationship(back_populates="incident")


class DetectionRunResult(Base):
    """Restart-safe cache for POST /api/detection/run's full API response,
    keyed by detection_id -- mirrors PashaRunResult exactly (same gap, same
    fix). Before this, `_RESULTS` in api/detection.py was the *only* place
    a detection_id lived; a backend restart made every previously-returned
    detection_id permanently unresolvable via GET /api/detection/{id}, even
    though the underlying SpillDetection rows survived fine in PostGIS."""

    __tablename__ = "detection_run_results"
    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True)
    incident_id: Mapped[str] = mapped_column(ForeignKey("incidents.id"), index=True)
    scene_id: Mapped[str] = mapped_column(ForeignKey("satellite_scenes.id"))
    result: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=lambda: dt.datetime.now(dt.timezone.utc))


class Observation(Base):
    """An uploaded SAR product, tracked from the moment a file lands on the
    server through SAFE unpacking, metadata extraction and (optionally)
    linkage to the SatelliteScene/Incident it was used to investigate.

    This is intentionally a separate table from SatelliteScene: a scene row
    only exists once metadata has been *confirmed* (product_id, acquisition
    time, geometry all present); an Observation can exist in a partially
    processed or failed state (bad zip, missing annotation XML, GeoTIFF with
    no calibration files) and that failure needs to be visible to whoever
    uploaded it, not silently dropped.
    """

    __tablename__ = "observations"
    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uid)
    incident_id: Mapped[str | None] = mapped_column(ForeignKey("incidents.id"), nullable=True)
    scene_id: Mapped[str | None] = mapped_column(ForeignKey("satellite_scenes.id"), nullable=True)
    original_filename: Mapped[str] = mapped_column(String(512))
    file_kind: Mapped[str] = mapped_column(String(32))  # safe_zip | geotiff | unknown
    sensor: Mapped[str | None] = mapped_column(String(64))
    product_id: Mapped[str | None] = mapped_column(String(255))
    product_type: Mapped[str | None] = mapped_column(String(32))
    acquisition_time: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    polarization: Mapped[str | None] = mapped_column(String(16))
    bbox: Mapped[object | None] = mapped_column(Geometry("POLYGON", srid=4326), nullable=True)
    safe_dir: Mapped[str | None] = mapped_column(Text)  # canonical unpacked path, if applicable
    status: Mapped[str] = mapped_column(String(32), default="uploaded")  # uploaded/ready/failed
    error_message: Mapped[str | None] = mapped_column(Text)
    extraction_diagnostics: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=lambda: dt.datetime.now(dt.timezone.utc))


class SatelliteScene(Base):
    __tablename__ = "satellite_scenes"
    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uid)
    incident_id: Mapped[str | None] = mapped_column(ForeignKey("incidents.id"))
    provider: Mapped[str] = mapped_column(String(64))
    product_id: Mapped[str] = mapped_column(String(255), unique=True)
    acquisition_time: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True))
    geometry: Mapped[object] = mapped_column(Geometry("POLYGON", srid=4326))
    polarization: Mapped[str | None] = mapped_column(String(16))
    processing_status: Mapped[str] = mapped_column(String(32), default="registered")
    source_url: Mapped[str | None] = mapped_column(Text)
    scene_metadata: Mapped[dict] = mapped_column(JSON, default=dict)

    incident: Mapped[Incident | None] = relationship(back_populates="scenes")


class SpillDetection(Base):
    __tablename__ = "spill_detections"
    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uid)
    incident_id: Mapped[str] = mapped_column(ForeignKey("incidents.id"))
    scene_id: Mapped[str] = mapped_column(ForeignKey("satellite_scenes.id"))
    geometry: Mapped[object] = mapped_column(Geometry("POLYGON", srid=4326))
    area_km2: Mapped[float] = mapped_column(Float)
    centroid: Mapped[object] = mapped_column(Geometry("POINT", srid=4326))
    orientation_deg: Mapped[float | None] = mapped_column(Float)
    length_km: Mapped[float | None] = mapped_column(Float)
    width_km: Mapped[float | None] = mapped_column(Float)
    compactness: Mapped[float | None] = mapped_column(Float)
    detection_score: Mapped[float] = mapped_column(Float)
    classification_label: Mapped[str] = mapped_column(String(64), default="OIL_SPILL_CANDIDATE")
    model_version: Mapped[str] = mapped_column(String(64))
    analyst_confirmed: Mapped[bool] = mapped_column(Boolean, default=False)

    incident: Mapped[Incident] = relationship(back_populates="detections")


class EnvironmentalDataset(Base):
    __tablename__ = "environmental_datasets"
    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uid)
    incident_id: Mapped[str] = mapped_column(ForeignKey("incidents.id"))
    provider: Mapped[str] = mapped_column(String(64))
    dataset: Mapped[str] = mapped_column(String(128))
    variable: Mapped[str] = mapped_column(String(64))
    time_start: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True))
    time_end: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True))
    bbox: Mapped[object] = mapped_column(Geometry("POLYGON", srid=4326))
    source_reference: Mapped[str | None] = mapped_column(Text)
    storage_path: Mapped[str | None] = mapped_column(Text)  # NetCDF in object storage


class OriginAnalysis(Base):
    __tablename__ = "origin_analyses"

    id = mapped_column(UUID(as_uuid=False), primary_key=True, default=uid)
    incident_id = mapped_column(ForeignKey("incidents.id"))
    probable_origin_geometry = mapped_column(
        Geometry("MULTIPOLYGON", srid=4326)
    )
    release_start = mapped_column(DateTime(timezone=True))
    release_end = mapped_column(DateTime(timezone=True))
    observation_time = mapped_column(DateTime(timezone=True), nullable=True)
    observed_slick_geometry = mapped_column(
        Geometry("POLYGON", srid=4326), nullable=True
    )
    uncertainty_km = mapped_column(Float)
    ensemble_size = mapped_column(Integer)
    model_version = mapped_column(String(64))
    density_field_path = mapped_column(Text, nullable=True)

    # NEW
    provenance: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

class DriftForecast(Base):
    __tablename__ = "drift_forecasts"
    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uid)
    incident_id: Mapped[str] = mapped_column(ForeignKey("incidents.id"))
    forecast_hours: Mapped[int] = mapped_column(Integer)
    geometry: Mapped[object] = mapped_column(Geometry("MULTIPOLYGON", srid=4326))
    model_run_id: Mapped[str] = mapped_column(String(64))


class Vessel(Base):
    __tablename__ = "vessels"
    mmsi: Mapped[str] = mapped_column(String(16), primary_key=True)
    imo: Mapped[str | None] = mapped_column(String(16))
    name: Mapped[str | None] = mapped_column(String(255))
    vessel_type: Mapped[str | None] = mapped_column(String(64))
    vessel_metadata: Mapped[dict] = mapped_column(JSON, default=dict)


class VesselTrack(Base):
    __tablename__ = "vessel_tracks"
    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uid)
    vessel_mmsi: Mapped[str] = mapped_column(ForeignKey("vessels.mmsi"))
    timestamp: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True))
    geometry: Mapped[object] = mapped_column(Geometry("POINT", srid=4326))
    speed_knots: Mapped[float | None] = mapped_column(Float)
    course_deg: Mapped[float | None] = mapped_column(Float)
    heading_deg: Mapped[float | None] = mapped_column(Float)
    source: Mapped[str] = mapped_column(String(64))

    __table_args__ = (UniqueConstraint("vessel_mmsi", "timestamp", "source"),)


class Candidate(Base):
    __tablename__ = "candidates"
    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uid)
    incident_id: Mapped[str] = mapped_column(ForeignKey("incidents.id"))
    vessel_mmsi: Mapped[str] = mapped_column(ForeignKey("vessels.mmsi"))
    spatial_score: Mapped[float] = mapped_column(Float)
    temporal_score: Mapped[float] = mapped_column(Float)
    trajectory_score: Mapped[float] = mapped_column(Float)
    behavioural_score: Mapped[float] = mapped_column(Float)
    overall_score: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(32), default="pending")  # PENDING/LEADING/SECONDARY/AMBIGUOUS/REJECTED

class PashaRun(Base):
    __tablename__ = "pasha_runs"
    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uid)
    candidate_id: Mapped[str] = mapped_column(ForeignKey("candidates.id"))
    release_location: Mapped[object] = mapped_column(Geometry("POINT", srid=4326))
    release_time: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True))
    model_configuration: Mapped[dict] = mapped_column(JSON, default=dict)
    simulation_status: Mapped[str] = mapped_column(String(32), default="pending")
    result_geometry: Mapped[object | None] = mapped_column(Geometry("MULTIPOLYGON", srid=4326), nullable=True)
    spatial_overlap: Mapped[float | None] = mapped_column(Float)
    centroid_distance_km: Mapped[float | None] = mapped_column(Float)
    temporal_error_h: Mapped[float | None] = mapped_column(Float)
    consistency_score: Mapped[float | None] = mapped_column(Float)


class PashaRunResult(Base):
    __tablename__ = "pasha_run_results"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
    )

    analysis_id: Mapped[str] = mapped_column(
        ForeignKey("origin_analyses.id"),
        nullable=False,
        index=True,
    )

    result: Mapped[dict] = mapped_column(
        JSON,
        nullable=False,
    )

    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: dt.datetime.now(dt.timezone.utc),
    )

class FalsificationResult(Base):
    __tablename__ = "falsification_results"
    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uid)
    pasha_run_id: Mapped[str] = mapped_column(ForeignKey("pasha_runs.id"))
    spatial_test: Mapped[bool] = mapped_column(Boolean)
    temporal_test: Mapped[bool] = mapped_column(Boolean)
    drift_test: Mapped[bool] = mapped_column(Boolean)
    physical_test: Mapped[bool] = mapped_column(Boolean)
    behavioural_signal: Mapped[float] = mapped_column(Float)
    reasons: Mapped[list] = mapped_column(JSON, default=list)  # e.g. ["SPATIAL_MISMATCH"]
    pass_fail: Mapped[bool] = mapped_column(Boolean)


class EvidenceReport(Base):
    __tablename__ = "evidence_reports"
    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uid)
    incident_id: Mapped[str] = mapped_column(ForeignKey("incidents.id"))
    generated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=lambda: dt.datetime.now(dt.timezone.utc))
    leading_candidate_mmsi: Mapped[str | None] = mapped_column(String(16))
    decision_status: Mapped[str] = mapped_column(String(32))  # incl. H0_UNKNOWN_SOURCE
    uncertainty: Mapped[dict] = mapped_column(JSON, default=dict)
    provenance: Mapped[dict] = mapped_column(JSON, default=dict)
    report_path: Mapped[str | None] = mapped_column(Text)
