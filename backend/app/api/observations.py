"""
SAR ingestion API -- gap-analysis section 6/7's biggest missing backend
capability. Before this, the only way a Sentinel-1 product reached the M1
pipeline was `GET /api/scenes/search` against CDSE followed by
`POST /api/detection/run`, which itself 404s until the operator manually
unzips the CDSE download with a script that does not actually exist in
this codebase (`scripts/prepare_scene.py` is referenced in comments
elsewhere but was never checked in). This module is the real replacement:
a single multipart upload that unpacks a SAFE zip to the exact path the
existing pipeline already expects, extracts real metadata from the
product's own annotation XML, and persists an auditable Observation row --
whether or not extraction fully succeeds.

Deliberately NOT covered here: running M1-M6 against the ingested product.
That's POST /api/investigations/from-observation in investigations.py, so
an analyst can review extracted metadata (and re-upload if something looks
wrong) before committing to a full investigation run.
"""
from __future__ import annotations

import shutil
import tempfile
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, UploadFile
from geoalchemy2.shape import to_shape
from shapely.geometry import box
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import IngestionError, InsufficientData
from app.core.logging import get_logger
from app.core.validation import validate_uuid_filter
from app.db.repository import (
    get_observation,
    list_observations,
    save_observation,
    set_observation_incident,
)
from app.db.session import get_session
from app.ingestion.sar_metadata import extract_sar_metadata
from app.ingestion.sar_unpack import VARUNA_TMP_ROOT, store_geotiff, unpack_safe_zip

router = APIRouter()
log = get_logger(__name__)

READY_STATUS = "ready"
GEOTIFF_STATUS = "registered_geotiff_only"
METADATA_INCOMPLETE_STATUS = "metadata_incomplete"

SAFE_ZIP_EXTENSIONS = {".zip"}
GEOTIFF_EXTENSIONS = {".tif", ".tiff"}


@router.post("/ingest")
async def ingest_observation(
    file: UploadFile = File(..., description="A CDSE Sentinel-1 GRD product zip, a zipped .SAFE folder, or a standalone GeoTIFF."),
    incident_id: str | None = Form(None, description="Attach to an existing incident. Omit to leave unattached until POST /api/investigations/from-observation creates one."),
    session: AsyncSession = Depends(get_session),
):
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in SAFE_ZIP_EXTENSIONS | GEOTIFF_EXTENSIONS:
        raise IngestionError(
            f"Unsupported file extension '{suffix}'. Expected a .zip (SAFE product) or .tif/.tiff.",
            filename=file.filename,
        )

    upload_id = str(uuid.uuid4())
    staging_dir = VARUNA_TMP_ROOT / "_incoming"
    staging_dir.mkdir(parents=True, exist_ok=True)
    staged_path = staging_dir / f"{upload_id}{suffix}"

    with open(staged_path, "wb") as out:
        shutil.copyfileobj(file.file, out)

    warnings: list[str] = []
    try:
        if suffix in SAFE_ZIP_EXTENSIONS:
            unpacked = unpack_safe_zip(staged_path)
            metadata = extract_sar_metadata(str(unpacked.safe_dir), unpacked.product_id)
            warnings = metadata.warnings
            status = READY_STATUS if (metadata.acquisition_time and metadata.bbox and metadata.polarizations) else METADATA_INCOMPLETE_STATUS

            observation = await save_observation(
                session,
                original_filename=file.filename or staged_path.name,
                file_kind="safe_zip",
                incident_id=incident_id,
                sensor=metadata.sensor,
                product_id=metadata.product_id,
                product_type=metadata.product_type,
                acquisition_time=metadata.acquisition_time,
                polarization="/".join(metadata.polarizations) if metadata.polarizations else None,
                bbox=box(*metadata.bbox) if metadata.bbox else None,
                safe_dir=str(unpacked.safe_dir),
                status=status,
                error_message=None,
                extraction_diagnostics={"warnings": warnings},
            )
        else:
            geotiff_path = store_geotiff(staged_path, file.filename or staged_path.name)
            bbox = _geotiff_bbox(geotiff_path, warnings)
            observation = await save_observation(
                session,
                original_filename=file.filename or geotiff_path.name,
                file_kind="geotiff",
                incident_id=incident_id,
                sensor=None,
                product_id=geotiff_path.stem,
                product_type=None,
                acquisition_time=None,
                polarization=None,
                bbox=box(*bbox) if bbox else None,
                safe_dir=None,
                status=GEOTIFF_STATUS,
                error_message=None,
                extraction_diagnostics={
                    "warnings": warnings + [
                        "Standalone GeoTIFF has no calibration/annotation XML -- "
                        "M1 DETECT cannot run against it directly. Registered for "
                        "reference only."
                    ]
                },
            )
    except IngestionError as exc:
        # Persist the failure too -- an analyst debugging "why didn't my
        # upload show up" should see a row with a reason, not nothing.
        observation = await save_observation(
            session,
            original_filename=file.filename or staged_path.name,
            file_kind="safe_zip" if suffix in SAFE_ZIP_EXTENSIONS else "geotiff",
            incident_id=incident_id,
            sensor=None, product_id=None, product_type=None,
            acquisition_time=None, polarization=None, bbox=None, safe_dir=None,
            status="failed", error_message=exc.message,
            extraction_diagnostics={"context": exc.context},
        )
        await session.commit()
        log.warning("observation_ingest_failed", observation_id=observation.id, reason=exc.message)
        raise
    finally:
        staged_path.unlink(missing_ok=True)

    await session.commit()
    log.info("observation_ingest_complete", observation_id=observation.id, status=observation.status, product_id=observation.product_id)

    return {
        "observation_id": observation.id,
        "status": observation.status,
        "incident_id": observation.incident_id,
        "sensor": observation.sensor,
        "product_id": observation.product_id,
        "product_type": observation.product_type,
        "acquisition_time": observation.acquisition_time.isoformat() if observation.acquisition_time else None,
        "polarization": observation.polarization,
        "bbox": list(to_shape(observation.bbox).bounds) if observation.bbox is not None else None,
        "warnings": warnings,
    }


def _geotiff_bbox(path: Path, warnings: list[str]) -> tuple[float, float, float, float] | None:
    try:
        import rasterio
        from rasterio.warp import transform_bounds

        with rasterio.open(path) as src:
            if src.crs is None:
                warnings.append("GeoTIFF has no CRS; bbox could not be computed.")
                return None
            return transform_bounds(src.crs, "EPSG:4326", *src.bounds)
    except Exception as exc:  # noqa: BLE001
        warnings.append(f"Could not read GeoTIFF georeferencing: {exc}")
        return None


@router.get("")
async def get_observations(incident_id: str | None = None, limit: int = 100, session: AsyncSession = Depends(get_session)):
    validate_uuid_filter(incident_id)
    return {"observations": await list_observations(session, incident_id=incident_id, limit=limit)}


@router.get("/{observation_id}")
async def get_observation_detail(observation_id: str, session: AsyncSession = Depends(get_session)):
    result = await get_observation(session, observation_id)
    if result is None:
        raise InsufficientData("No observation with this id.", observation_id=observation_id)
    return result


@router.post("/{observation_id}/attach")
async def attach_observation_to_incident(observation_id: str, incident_id: str = Form(...), session: AsyncSession = Depends(get_session)):
    """Lets an analyst link an observation uploaded before an incident
    existed (or move it to a different one) without re-uploading."""
    existing = await get_observation(session, observation_id)
    if existing is None:
        raise InsufficientData("No observation with this id.", observation_id=observation_id)
    await set_observation_incident(session, observation_id, incident_id)
    await session.commit()
    return await get_observation(session, observation_id)
