"""
M1 DETECT API (spec section 21: POST /api/detection/run, GET /api/detection/{id}).

No database wiring lands until the persistence phase, so results are held
in a process-local dict keyed by a UUID -- fine for exercising the pipeline
end-to-end against a real SAFE product on a machine with CDSE access, not
fine for production (a restart loses every detection). This is called out
explicitly rather than quietly shipped as if it were durable storage.
"""
from __future__ import annotations

import tempfile
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import InsufficientData
from app.core.logging import get_logger
from app.core.provenance import DataKind, Provenance
from app.db.repository import save_satellite_scene, save_spill_detection
from app.db.session import get_session
from app.detection.pipeline import run_detection_from_safe
from app.detection.postprocessing import LookAlikeRules
from app.providers.sentinel1 import get_sentinel1_provider

router = APIRouter()
log = get_logger(__name__)

_RESULTS: dict[str, dict] = {}  # process-local cache for GET /api/detection/{id}; DB rows are the source of truth


class DetectionRequest(BaseModel):
    incident_id: str = Field(..., description="id returned by POST /api/incidents")
    product_id: str = Field(..., description="CDSE STAC item id of a Sentinel-1 GRD scene")
    minlon: float
    minlat: float
    maxlon: float
    maxlat: float
    polarization: str = "vv"
    min_area_km2: float = 0.01
    min_elongation: float = 1.3


@router.post("/run")
async def run_detection(req: DetectionRequest, session: AsyncSession = Depends(get_session)):
    """Downloads the named GRD product from CDSE (or reuses a cached copy in
    /tmp for this process) and runs the real M1 DETECT pipeline against it,
    then persists the satellite scene and every accepted candidate as real
    PostGIS rows against `req.incident_id`. This will raise 424
    PROVIDER_NOT_CONFIGURED if CDSE credentials are missing -- there is no
    synthetic fallback path here at all."""
    provider = get_sentinel1_provider()
    detection_id = str(uuid.uuid4())

    safe_root = Path(tempfile.gettempdir()) / "varuna-netra" / req.product_id
    safe_root.mkdir(parents=True, exist_ok=True)
    archive_path = safe_root / f"{req.product_id}.zip"

    if not archive_path.exists():
        await provider.download_scene(req.product_id, str(archive_path))
        raise InsufficientData(
            "Scene downloaded but not yet unpacked. Run "
            "`python -m scripts.prepare_scene --product-id {}` to unzip it "
            "into a .SAFE directory, then call this endpoint again.".format(req.product_id),
            archive_path=str(archive_path),
        )

    safe_dir = safe_root / f"{req.product_id}.SAFE"
    candidates, diagnostics = run_detection_from_safe(
        str(safe_dir),
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
    scene_metadata = await provider.get_scene(req.product_id)

    acquisition_time = scene_metadata.get("acquisition_time")
    if not acquisition_time:
        raise InsufficientData(
            "Sentinel-1 scene metadata does not contain acquisition time.",
            product_id=req.product_id,
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
