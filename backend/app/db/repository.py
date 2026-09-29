"""
Persistence layer wiring the pipeline's in-memory results (currently held
in process-local dicts in app/api/detection.py, drift.py, vessels.py,
pasha.py, reports.py) to real PostGIS rows via the models in db/models.py.

Uses geoalchemy2's `from_shape`/`to_shape` to convert between Shapely
geometries (what every pipeline module already produces) and the WKB
GeoAlchemy2 stores -- this is the standard, documented pattern, not a
custom serialization.
"""
from __future__ import annotations

import datetime as dt

from geoalchemy2.shape import from_shape, to_shape
from shapely.geometry.base import BaseGeometry
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import models


async def save_incident(session: AsyncSession, name: str, bbox: BaseGeometry) -> models.Incident:
    row = models.Incident(name=name, bbox=from_shape(bbox, srid=4326), status="open")
    session.add(row)
    await session.flush()
    return row


async def save_satellite_scene(
    session: AsyncSession, incident_id: str, provider: str, product_id: str,
    acquisition_time: dt.datetime, geometry: BaseGeometry, polarization: str | None,
    source_url: str | None, metadata: dict,
) -> models.SatelliteScene:
    from sqlalchemy import select

    result = await session.execute(
        select(models.SatelliteScene).where(
            models.SatelliteScene.product_id == product_id
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        # Reuse the existing scene for this Sentinel-1 product.
        # A product_id uniquely identifies the downloaded satellite scene.
        existing.incident_id = incident_id
        existing.provider = provider
        existing.acquisition_time = acquisition_time
        existing.geometry = from_shape(geometry, srid=4326)
        existing.polarization = polarization
        existing.processing_status = "processed"
        existing.source_url = source_url
        existing.scene_metadata = metadata

        await session.flush()
        return existing

    row = models.SatelliteScene(
        incident_id=incident_id,
        provider=provider,
        product_id=product_id,
        acquisition_time=acquisition_time,
        geometry=from_shape(geometry, srid=4326),
        polarization=polarization,
        processing_status="processed",
        source_url=source_url,
        scene_metadata=metadata,
    )
    session.add(row)
    await session.flush()
    return row


async def save_spill_detection(
    session: AsyncSession, incident_id: str, scene_id: str, candidate: dict,
) -> models.SpillDetection:
    from shapely.geometry import shape as shapely_shape
    geom = shapely_shape(candidate["geometry"])
    row = models.SpillDetection(
        incident_id=incident_id, scene_id=scene_id,
        geometry=from_shape(geom, srid=4326),
        area_km2=candidate["area_km2"],
        centroid=from_shape(geom.centroid, srid=4326),
        orientation_deg=candidate.get("orientation_deg"),
        length_km=candidate.get("length_km"),
        width_km=candidate.get("width_km"),
        compactness=candidate.get("compactness"),
        detection_score=candidate["detection_score"],
        classification_label=candidate.get("classification_label", "OIL_SPILL_CANDIDATE"),
        model_version=candidate.get("model_version", "m1-cfar-baseline-0.1.0"),
        analyst_confirmed=False,
    )
    session.add(row)
    await session.flush()
    return row


async def save_origin_analysis(
    session: AsyncSession,
    incident_id: str,
    origin_region: BaseGeometry | None,
    release_start: dt.datetime,
    release_end: dt.datetime,
    uncertainty_km: float,
    ensemble_size: int,
    model_version: str,
    observation_time: dt.datetime | None = None,
    observed_slick_geometry: BaseGeometry | None = None,
    provenance: dict | None = None,
) -> models.OriginAnalysis:
    from shapely.geometry import MultiPolygon

    geom = origin_region
    if geom is not None and geom.geom_type == "Polygon":
        geom = MultiPolygon([geom])

    row = models.OriginAnalysis(
        incident_id=incident_id,
        probable_origin_geometry=(
            from_shape(geom, srid=4326) if geom is not None else None
        ),
        release_start=release_start,
        release_end=release_end,
        observation_time=observation_time,
        observed_slick_geometry=(
            from_shape(observed_slick_geometry, srid=4326)
            if observed_slick_geometry is not None
            else None
        ),
        uncertainty_km=uncertainty_km,
        ensemble_size=ensemble_size,
        model_version=model_version,
        provenance=provenance or {},
    )

    print(
        "M2 PERSIST DEBUG:",
        "observation_time=", observation_time,
        "provenance_keys=", list((provenance or {}).keys()),
    )

    session.add(row)
    await session.flush()
    return row


async def upsert_vessel(session: AsyncSession, mmsi: str, imo: str | None, name: str | None, vessel_type: str | None) -> models.Vessel:
    from sqlalchemy import select
    result = await session.execute(select(models.Vessel).where(models.Vessel.mmsi == mmsi))
    existing = result.scalar_one_or_none()
    if existing:
        existing.imo = imo or existing.imo
        existing.name = name or existing.name
        existing.vessel_type = vessel_type or existing.vessel_type
        await session.flush()
        return existing
    row = models.Vessel(mmsi=mmsi, imo=imo, name=name, vessel_type=vessel_type, vessel_metadata={})
    session.add(row)
    await session.flush()
    return row


async def save_candidate(
    session: AsyncSession,
    incident_id: str,
    vessel_mmsi: str,
    scored: dict,
) -> models.Candidate:
    from sqlalchemy import select

    result = await session.execute(
        select(models.Candidate)
        .where(
            models.Candidate.incident_id == incident_id,
            models.Candidate.vessel_mmsi == vessel_mmsi,
        )
        .order_by(models.Candidate.id)
    )

    rows = result.scalars().all()

    if rows:
        # Keep the first row as the canonical candidate.
        row = rows[0]

        row.spatial_score = scored["spatial_score"]
        row.temporal_score = scored["temporal_score"]
        row.trajectory_score = scored["trajectory_score"]
        row.behavioural_score = scored["behavioural_score"]
        row.overall_score = scored["overall_score"]

        # Do not overwrite a PASHA decision.
        if row.status in (None, "", "pending"):
            row.status = scored.get("status", "pending")

        await session.flush()
        return row

    row = models.Candidate(
        incident_id=incident_id,
        vessel_mmsi=vessel_mmsi,
        spatial_score=scored["spatial_score"],
        temporal_score=scored["temporal_score"],
        trajectory_score=scored["trajectory_score"],
        behavioural_score=scored["behavioural_score"],
        overall_score=scored["overall_score"],
        status=scored.get("status", "pending"),
    )

    session.add(row)
    await session.flush()
    return row


async def update_candidate_status(session: AsyncSession, candidate_id: str, status: str) -> None:
    from sqlalchemy import select
    result = await session.execute(select(models.Candidate).where(models.Candidate.id == candidate_id))
    row = result.scalar_one_or_none()
    if row is not None:
        row.status = status
        await session.flush()


async def save_pasha_run(
    session: AsyncSession, candidate_id: str, release_point: BaseGeometry, release_time: dt.datetime,
    model_configuration: dict, result_geometry: BaseGeometry | None,
    spatial_overlap: float, centroid_distance_km: float, temporal_error_h: float, consistency_score: float,
) -> models.PashaRun:
    from shapely.geometry import MultiPolygon
    geom = result_geometry
    if geom is not None and geom.geom_type == "Polygon":
        geom = MultiPolygon([geom])
    row = models.PashaRun(
        candidate_id=candidate_id, release_location=from_shape(release_point, srid=4326),
        release_time=release_time, model_configuration=model_configuration,
        simulation_status="complete", result_geometry=from_shape(geom, srid=4326) if geom is not None else None,
        spatial_overlap=spatial_overlap, centroid_distance_km=centroid_distance_km,
        temporal_error_h=temporal_error_h, consistency_score=consistency_score,
    )
    session.add(row)
    await session.flush()
    return row


async def save_falsification_result(session: AsyncSession, pasha_run_id: str, falsification: dict) -> models.FalsificationResult:
    row = models.FalsificationResult(
        pasha_run_id=pasha_run_id,
        spatial_test=falsification["spatial_test"], temporal_test=falsification["temporal_test"],
        drift_test=falsification["drift_test"], physical_test=falsification["physical_test"],
        behavioural_signal=falsification["behavioural_signal"], reasons=falsification["reasons"],
        pass_fail=falsification["pass_fail"],
    )
    session.add(row)
    await session.flush()
    return row


async def save_evidence_report(
    session: AsyncSession, incident_id: str, leading_candidate_mmsi: str | None,
    decision_status: str, uncertainty: dict, provenance: dict, report_path: str,
) -> models.EvidenceReport:
    row = models.EvidenceReport(
        incident_id=incident_id, leading_candidate_mmsi=leading_candidate_mmsi,
        decision_status=decision_status, uncertainty=uncertainty, provenance=provenance, report_path=report_path,
    )
    session.add(row)
    await session.flush()
    return row


async def get_incident_with_detections(session: AsyncSession, incident_id: str):
    from sqlalchemy import select
    result = await session.execute(
        select(models.Incident).where(models.Incident.id == incident_id)
    )
    incident = result.scalar_one_or_none()
    if incident is None:
        return None
    det_result = await session.execute(
        select(models.SpillDetection).where(models.SpillDetection.incident_id == incident_id)
    )
    detections = det_result.scalars().all()
    return {
        "incident": {"id": incident.id, "name": incident.name, "bbox": to_shape(incident.bbox).__geo_interface__,
                     "status": incident.status},
        "detections": [
            {"id": d.id, "geometry": to_shape(d.geometry).__geo_interface__, "area_km2": d.area_km2,
             "detection_score": d.detection_score, "classification_label": d.classification_label}
            for d in detections
        ],
    }


async def save_observation(
    session: AsyncSession,
    *,
    original_filename: str,
    file_kind: str,
    incident_id: str | None,
    sensor: str | None,
    product_id: str | None,
    product_type: str | None,
    acquisition_time: dt.datetime | None,
    polarization: str | None,
    bbox: BaseGeometry | None,
    safe_dir: str | None,
    status: str,
    error_message: str | None,
    extraction_diagnostics: dict,
) -> models.Observation:
    row = models.Observation(
        incident_id=incident_id,
        original_filename=original_filename,
        file_kind=file_kind,
        sensor=sensor,
        product_id=product_id,
        product_type=product_type,
        acquisition_time=acquisition_time,
        polarization=polarization,
        bbox=from_shape(bbox, srid=4326) if bbox is not None else None,
        safe_dir=safe_dir,
        status=status,
        error_message=error_message,
        extraction_diagnostics=extraction_diagnostics,
    )
    session.add(row)
    await session.flush()
    return row


def _observation_to_dict(row: models.Observation) -> dict:
    return {
        "id": row.id,
        "incident_id": row.incident_id,
        "scene_id": row.scene_id,
        "original_filename": row.original_filename,
        "file_kind": row.file_kind,
        "sensor": row.sensor,
        "product_id": row.product_id,
        "product_type": row.product_type,
        "acquisition_time": row.acquisition_time.isoformat() if row.acquisition_time else None,
        "polarization": row.polarization,
        "bbox": to_shape(row.bbox).bounds if row.bbox is not None else None,
        "safe_dir": row.safe_dir,
        "status": row.status,
        "error_message": row.error_message,
        "extraction_diagnostics": row.extraction_diagnostics,
        "created_at": row.created_at.isoformat(),
    }


async def get_observation(session: AsyncSession, observation_id: str) -> dict | None:
    from sqlalchemy import select
    result = await session.execute(select(models.Observation).where(models.Observation.id == observation_id))
    row = result.scalar_one_or_none()
    return _observation_to_dict(row) if row else None


async def list_observations(session: AsyncSession, incident_id: str | None = None, limit: int = 100) -> list[dict]:
    from sqlalchemy import select
    query = select(models.Observation).order_by(models.Observation.created_at.desc()).limit(limit)
    if incident_id:
        query = query.where(models.Observation.incident_id == incident_id)
    result = await session.execute(query)
    return [_observation_to_dict(row) for row in result.scalars().all()]


async def set_observation_incident(session: AsyncSession, observation_id: str, incident_id: str) -> None:
    from sqlalchemy import select
    result = await session.execute(select(models.Observation).where(models.Observation.id == observation_id))
    row = result.scalar_one_or_none()
    if row is not None:
        row.incident_id = incident_id
        await session.flush()


async def list_pasha_run_history(session: AsyncSession, incident_id: str | None = None, limit: int = 100) -> list[dict]:
    """Backend gap-analysis section 10 ("PASHA history"): rather than a new
    simulation-tracking engine, this reads the same PashaRunResult rows
    /api/pasha/{run_id} already serves, joined through OriginAnalysis to
    filter by incident -- the run's full candidate list and outcome are
    already inside `result`, exactly as POST /api/pasha/run produced them.
    """
    from sqlalchemy import select

    query = (
        select(models.PashaRunResult, models.OriginAnalysis.incident_id)
        .join(models.OriginAnalysis, models.PashaRunResult.analysis_id == models.OriginAnalysis.id)
        .order_by(models.PashaRunResult.created_at.desc())
        .limit(limit)
    )
    if incident_id:
        query = query.where(models.OriginAnalysis.incident_id == incident_id)

    result = await session.execute(query)
    runs = []
    for pasha_row, row_incident_id in result.all():
        payload = pasha_row.result or {}
        outcome = payload.get("outcome", {})
        candidates = payload.get("candidates", [])
        leading_key = outcome.get("leading_candidate")
        leading = next((c for c in candidates if c.get("vessel_key") == leading_key), None)
        runs.append({
            "run_id": pasha_row.id,
            "analysis_id": pasha_row.analysis_id,
            "incident_id": row_incident_id,
            "created_at": pasha_row.created_at.isoformat(),
            "status": outcome.get("status"),
            "leading_candidate_mmsi": leading.get("mmsi") if leading else None,
            "leading_candidate_name": leading.get("name") if leading else None,
            "candidate_count": len(candidates),
        })
    return runs


async def list_incidents(session: AsyncSession, limit: int = 100) -> list[dict]:
    from sqlalchemy import select
    result = await session.execute(
        select(models.Incident).order_by(models.Incident.created_at.desc()).limit(limit)
    )
    return [
        {"id": row.id, "name": row.name, "status": row.status,
         "bbox": to_shape(row.bbox).__geo_interface__, "created_at": row.created_at.isoformat()}
        for row in result.scalars().all()
    ]


async def list_scenes(session: AsyncSession, incident_id: str | None = None, limit: int = 100) -> list[dict]:
    from sqlalchemy import select
    query = select(models.SatelliteScene).order_by(models.SatelliteScene.acquisition_time.desc()).limit(limit)
    if incident_id:
        query = query.where(models.SatelliteScene.incident_id == incident_id)
    result = await session.execute(query)
    return [
        {"id": row.id, "incident_id": row.incident_id, "provider": row.provider, "product_id": row.product_id,
         "acquisition_time": row.acquisition_time.isoformat(), "polarization": row.polarization,
         "processing_status": row.processing_status, "geometry": to_shape(row.geometry).__geo_interface__}
        for row in result.scalars().all()
    ]


async def list_vessels(session: AsyncSession, limit: int = 200) -> list[dict]:
    from sqlalchemy import select
    result = await session.execute(select(models.Vessel).limit(limit))
    return [
        {"mmsi": row.mmsi, "imo": row.imo, "name": row.name, "vessel_type": row.vessel_type}
        for row in result.scalars().all()
    ]


async def list_reports(session: AsyncSession, incident_id: str | None = None, limit: int = 100) -> list[dict]:
    from sqlalchemy import select
    query = select(models.EvidenceReport).order_by(models.EvidenceReport.generated_at.desc()).limit(limit)
    if incident_id:
        query = query.where(models.EvidenceReport.incident_id == incident_id)
    result = await session.execute(query)
    return [
        {"id": row.id, "incident_id": row.incident_id, "generated_at": row.generated_at.isoformat(),
         "leading_candidate_mmsi": row.leading_candidate_mmsi, "decision_status": row.decision_status}
        for row in result.scalars().all()
    ]
