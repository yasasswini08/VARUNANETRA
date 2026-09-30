"""
M1 DETECT API (spec section 21: POST /api/detection/run, GET /api/detection/{id}).
No database wiring lands until the persistence phase, so results are held
in a process-local dict keyed by a UUID -- fine for exercising the pipeline
end-to-end against a real SAFE product on a machine with CDSE access, not
fine for production (a restart loses every detection). This is called out
explicitly rather than quietly shipped as if it were durable storage.
"""
from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import InsufficientData
from app.core.logging import get_logger
from app.core.provenance import DataKind, Provenance
from app.db.repository import (
    get_observation,
    save_satellite_scene,
    save_spill_detection,
)
from app.db.session import get_session
from app.detection.pipeline import run_detection_from_safe
from app.detection.postprocessing import LookAlikeRules

router = APIRouter()
log = get_logger(__name__)

_RESULTS: dict[str, dict] = {}  # process-local cache for GET /api/detection/{id}; DB rows are the source of truth


class DetectionRequest(BaseModel):
    incident_id: str = Field(
        ...,
        description="id returned by POST /api/incidents",
    )
    observation_id: str = Field(
        ...,
        description="Observation ID of the uploaded Sentinel-1 SAFE product",
    )
    product_id: str = Field(
        ...,
        description="CDSE STAC item ID or uploaded product ID",
    )
    minlon: float
    minlat: float
    maxlon: float
    maxlat: float
    polarization: str = "vv"
    min_area_km2: float = 0.01
    min_elongation: float = 1.3


@router.post("/run")
async def run_detection(
    req: DetectionRequest,
    session: AsyncSession = Depends(get_session),
):
    detection_id = str(uuid.uuid4())
    observation = await get_observation(session, req.observation_id)

    if observation is None:
        raise InsufficientData(
            "No observation found for the supplied observation_id.",
            observation_id=req.observation_id,
        )
    
    safe_dir = observation.get("safe_dir")
    
    if not safe_dir:
        raise InsufficientData(
            "Observation does not contain an unpacked SAFE directory.",
            observation_id=req.observation_id,
        )
    
    safe_path = Path(safe_dir)
    
    if not safe_path.exists() or not safe_path.is_dir():
        raise InsufficientData(
            "The observation SAFE directory does not exist on the backend.",
            observation_id=req.observation_id,
            safe_dir=safe_dir,
        )

    candidates, diagnostics = run_detection_from_safe(
        str(safe_path),
        (req.minlon, req.minlat, req.maxlon, req.maxlat),
        polarization=req.polarization,
        look_alike_rules=LookAlikeRules(min_area_km2=req.min_area_km2, min_elongation=req.min_elongation),
    )

    scene_provenance = Provenance(
        kind=DataKind.REAL,
        source="Copernicus Data Space Ecosystem",
        dataset="SENTINEL-1 GRD",
        product_id=req.product_id,
        bbox=[req.minlon, req.minlat, req.maxlon, req.maxlat],
    )

    from shapely.geometry import box
    import datetime as dt

    # Retrieve authoritative Sentinel-1 acquisition metadata from CDSE.
    # Use the authoritative metadata extracted from the uploaded SAFE
    # during SAR ingestion. Do not query CDSE again.
    acquisition_time = observation.get("acquisition_time")
    
    if not acquisition_time:
        raise InsufficientData(
            "Observation does not contain acquisition time.",
            observation_id=req.observation_id,
        )
    
    if isinstance(acquisition_time, str):
        acquisition_time = dt.datetime.fromisoformat(
            acquisition_time.replace("Z", "+00:00")
        )

    scene_row = await save_satellite_scene(
        session,
        req.incident_id,
        "sentinel1_cdse",
        req.product_id,
        acquisition_time,
        box(req.minlon, req.minlat, req.maxlon, req.maxlat),
        req.polarization,
        scene_provenance.source_url,
        scene_provenance.model_dump(mode="json"),
    )

    persisted_ids = []
    for c in candidates:
        if c["rejected_reason"] is None:
            row = await save_spill_detection(session, req.incident_id, scene_row.id, c)
            persisted_ids.append(row.id)
    await session.commit()

    provenance = Provenance(
        kind=DataKind.DERIVED,
        source="Varuna Netra M1 DETECT (CFAR baseline)",
        dataset=req.product_id,
        bbox=[req.minlon, req.minlat, req.maxlon, req.maxlat],
        model_version="m1-cfar-baseline-0.1.0",
        parameters=diagnostics["cfar_params"],
    )
    result = {
        "detection_id": detection_id,
        "incident_id": req.incident_id,
        "scene_id": scene_row.id,
        "persisted_detection_ids": persisted_ids,
        "product_id": req.product_id,
        "candidates": candidates,
        "diagnostics": diagnostics,
        "provenance": provenance.model_dump(mode="json"),
    }

    # Persist the exact API response so GET remains available after a
    # backend/container restart -- same pattern as PashaRunResult below.
    from app.db import models
    session.add(models.DetectionRunResult(
        id=detection_id, incident_id=req.incident_id, scene_id=scene_row.id, result=result,
    ))
    await session.commit()

    _RESULTS[detection_id] = result
    log.info("detection_run_complete", detection_id=detection_id, persisted_count=len(persisted_ids), **diagnostics)
    return result


@router.get("/{detection_id}")
async def get_detection(detection_id: str, session: AsyncSession = Depends(get_session)):
    if detection_id in _RESULTS:
        return _RESULTS[detection_id]

    from sqlalchemy import select

    from app.db import models
    result = await session.execute(
        select(models.DetectionRunResult).where(models.DetectionRunResult.id == detection_id)
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise InsufficientData("No detection result with this id.", detection_id=detection_id)

    _RESULTS[detection_id] = row.result
    return row.result
