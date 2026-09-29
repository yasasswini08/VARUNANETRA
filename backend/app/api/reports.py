"""
M6 report API (spec section 21: POST /api/reports/{incident_id}/generate,
GET /api/reports/{id}).

Takes the outputs of a completed PASHA run (from POST /api/pasha/run) plus
the origin analysis and observed slick, and produces a real PDF via
app/reports/evidence_dossier.py, then persists an EvidenceReport row
recording the decision status, uncertainty, provenance and PDF path -- the
one part of this endpoint that genuinely needed a database (the PDF itself
still lives on local disk under /tmp; S3/MinIO upload is a real remaining
gap, not invented here).
"""
from __future__ import annotations

import datetime as dt
import tempfile
import uuid
from pathlib import Path

from geoalchemy2.shape import to_shape
from shapely.geometry import shape
from sqlalchemy import select

from app.db import models
from app.drift.artifact import load_m2_trajectory



from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.drift import _RESULTS as DRIFT_RESULTS
from app.api.pasha import _RESULTS as PASHA_RESULTS
from app.config import get_settings
from app.core.exceptions import InsufficientData
from app.db.repository import save_evidence_report, list_reports
from app.db.session import get_session
from app.reports.evidence_dossier import build_evidence_dossier_pdf

router = APIRouter()
_REPORTS: dict[str, dict] = {}


@router.get("")
async def get_persisted_reports(incident_id: str | None = None, limit: int = 100, session: AsyncSession = Depends(get_session)):
    return {"reports": await list_reports(session, incident_id=incident_id, limit=limit)}

DEFAULT_LIMITATIONS = [
    "M1 DETECT uses a deterministic CFAR baseline; no trained segmentation model is included in this build.",
    "Geocoding uses an approximate GCP-based affine transform without terrain (DEM) correction; valid over open water only.",
    "The release-time window is derived from an externally supplied slick-age estimate, not from the backward "
    "ensemble's own particle spread, which grows with elapsed simulation time regardless of the true release point.",
    "AIS coverage gaps do not by themselves indicate involvement; they are treated only as supporting evidence.",
    "This investigation uses real Sentinel-1, ERA5, CMEMS and Global Fishing Watch data. Results remain subject to sensor ambiguity, environmental-model uncertainty and AIS coverage limitations.",
    "been validated against a real Sentinel-1 scene or live ERA5/CMEMS/AIS data.",
]


class ReportRequest(BaseModel):
    pasha_run_id: str
    observed_slick_geometry: dict
    sentinel1_scene: dict = {}
    spill_detection: dict = {}


@router.post("/{incident_id}/generate")
async def generate_report(
    incident_id: str,
    req: ReportRequest,
    session: AsyncSession = Depends(get_session),
):
    # ---------------------------------------------------------
    # 1. Load the persisted M5 API result
    # ---------------------------------------------------------
    db_pasha = await session.execute(
        select(models.PashaRunResult).where(
            models.PashaRunResult.id == req.pasha_run_id
        )
    )

    pasha_row = db_pasha.scalar_one_or_none()

    if pasha_row is None:
        raise InsufficientData(
            "No persisted PASHA run found.",
            pasha_run_id=req.pasha_run_id,
        )

    pasha = pasha_row.result
    analysis_id = pasha["analysis_id"]

    # ---------------------------------------------------------
    # 2. Load persisted M2 analysis
    # ---------------------------------------------------------
    db_analysis = await session.scalar(
        select(models.OriginAnalysis).where(
            models.OriginAnalysis.id == analysis_id
        )
    )

    if db_analysis is None:
        raise InsufficientData(
            "No persisted drift analysis found for this PASHA run.",
            analysis_id=analysis_id,
        )

    if not db_analysis.density_field_path:
        raise InsufficientData(
            "M2 trajectory artifact is not persisted.",
            analysis_id=analysis_id,
        )

    try:
        backward_result = load_m2_trajectory(
            db_analysis.density_field_path
        )
    except FileNotFoundError as exc:
        raise InsufficientData(
            "M2 trajectory artifact is missing.",
            analysis_id=analysis_id,
            path=db_analysis.density_field_path,
        ) from exc

    # Load the persisted incident for the report AOI.
    db_incident = await session.scalar(
        select(models.Incident).where(
            models.Incident.id == incident_id
        )
    )

    if db_incident is None:
        raise InsufficientData(
            "No persisted incident found.",
            incident_id=incident_id,
        )

    incident_bbox_geom = to_shape(db_incident.bbox)
    minx, miny, maxx, maxy = incident_bbox_geom.bounds
    aoi_bbox = (minx, miny, maxx, maxy)

    # ---------------------------------------------------------
    # 3. Reconstruct M2 origin-analysis information
    # ---------------------------------------------------------

    origin_geometry = (
        to_shape(db_analysis.probable_origin_geometry).__geo_interface__
        if db_analysis.probable_origin_geometry is not None
        else None
    )

    origin_analysis = {
        "id": db_analysis.id,
        "incident_id": db_analysis.incident_id,
        "probable_origin_geometry": origin_geometry,
        "probable_origin_centroid": (
            {
                "lon": float(
                    to_shape(
                        db_analysis.probable_origin_geometry
                    ).centroid.x
                ),
                "lat": float(
                    to_shape(
                        db_analysis.probable_origin_geometry
                    ).centroid.y
                ),
            }
            if db_analysis.probable_origin_geometry is not None
            else None
        ),
        "release_start": db_analysis.release_start.isoformat(),
        "release_end": db_analysis.release_end.isoformat(),
        "observation_time": (
            db_analysis.observation_time.isoformat()
            if db_analysis.observation_time is not None
            else None
        ),
        "uncertainty_km": db_analysis.uncertainty_km,
        "ensemble_size": db_analysis.ensemble_size,
        "model_version": db_analysis.model_version,
        "provenance": db_analysis.provenance or {},
}

    # ---------------------------------------------------------
    # 4. Recover observation time from persisted M2 artifact
    # ---------------------------------------------------------
    obs_np = backward_result["time"].values.max()

    observation_time = dt.datetime.utcfromtimestamp(
        obs_np.astype("datetime64[s]").astype(int)
    )

    # ---------------------------------------------------------
    # 5. Persisted observed slick geometry if available
    # ---------------------------------------------------------
    observed_slick_geometry = req.observed_slick_geometry

    if (
        not observed_slick_geometry
        and db_analysis.observed_slick_geometry is not None
    ):
        observed_slick_geometry = (
            to_shape(
                db_analysis.observed_slick_geometry
            ).__geo_interface__
        )

    if not observed_slick_geometry:
        raise InsufficientData(
            "Observed slick geometry is required for the evidence report.",
            analysis_id=analysis_id,
        )

    # ---------------------------------------------------------
    # 6. Persistent report artifact location
    # ---------------------------------------------------------
    out_dir = Path("/tmp/varuna-netra/reports")
    out_dir.mkdir(parents=True, exist_ok=True)

    report_id = str(uuid.uuid4())
    pdf_path = out_dir / f"{report_id}.pdf"

    settings = get_settings()

    # ---------------------------------------------------------
    # 7. Build real evidence dossier PDF
    # ---------------------------------------------------------
    build_evidence_dossier_pdf(
        incident_id=incident_id,
        observation_time=observation_time,
        aoi_bbox=aoi_bbox,
        sentinel1_scene=req.sentinel1_scene or {
            "note": "No Sentinel-1 scene metadata supplied to this report."
        },
        spill_detection=req.spill_detection or {
            "note": "No M1 detection metadata supplied to this report."
        },
        origin_analysis=origin_analysis,
        environmental_provenance=origin_analysis.get(
            "provenance",
            {},
        ),
        candidates=pasha["candidates"],
        outcome=pasha["outcome"],
        model_versions={
            "pipeline": settings.model_version,
        },
        limitations=DEFAULT_LIMITATIONS,
        observed_slick_geometry=observed_slick_geometry,
        output_path=str(pdf_path),
    )

    # ---------------------------------------------------------
    # 8. Determine leading candidate
    # ---------------------------------------------------------
    leading = pasha["outcome"].get("leading_candidate")

    leading_mmsi = None

    for candidate in pasha["candidates"]:
        if candidate.get("vessel_key") == leading:
            leading_mmsi = candidate.get("mmsi")
            break

    # ---------------------------------------------------------
    # 9. Persist EvidenceReport
    # ---------------------------------------------------------
    db_row = await save_evidence_report(
        session,
        incident_id,
        leading_mmsi,
        pasha["outcome"]["status"],
        uncertainty={
            "origin_uncertainty_km": (
                origin_analysis.get("uncertainty_km")
            ),
            "margin": pasha["outcome"].get("margin"),
        },
        provenance=origin_analysis.get(
            "provenance",
            {},
        ),
        report_path=str(pdf_path),
    )

    await session.commit()

    # ---------------------------------------------------------
    # 10. Cache for fast access
    # ---------------------------------------------------------
    report_response = {
        "report_id": db_row.id,
        "incident_id": incident_id,
        "pasha_run_id": req.pasha_run_id,
        "generated_at": db_row.generated_at.isoformat(),
        "decision_status": pasha["outcome"]["status"],
        "report_path": str(pdf_path),
    }

    _REPORTS[db_row.id] = report_response

    return report_response


@router.get("/{report_id}")
async def get_report(
    report_id: str,
    session: AsyncSession = Depends(get_session),
):
    # Fast path
    if report_id in _REPORTS:
        report = _REPORTS[report_id]

        report_path = Path(report["report_path"])

        if not report_path.exists():
            raise InsufficientData(
                "Persisted report artifact is missing.",
                report_id=report_id,
                path=str(report_path),
            )

        return FileResponse(
            str(report_path),
            media_type="application/pdf",
            filename=f"varuna-netra-{report_id}.pdf",
        )

    # Persistent fallback
    db_result = await session.execute(
        select(models.EvidenceReport).where(
            models.EvidenceReport.id == report_id
        )
    )

    db_report = db_result.scalar_one_or_none()

    if db_report is None:
        raise InsufficientData(
            "No report found in persistent storage.",
            report_id=report_id,
        )

    if not db_report.report_path:
        raise InsufficientData(
            "Report record exists but has no PDF artifact path.",
            report_id=report_id,
        )

    report_path = Path(db_report.report_path)

    if not report_path.exists():
        raise InsufficientData(
            "Persisted report artifact is missing.",
            report_id=report_id,
            path=str(report_path),
        )

    _REPORTS[report_id] = {
        "report_id": db_report.id,
        "incident_id": db_report.incident_id,
        "generated_at": db_report.generated_at.isoformat(),
        "decision_status": db_report.decision_status,
        "report_path": db_report.report_path,
    }

    return FileResponse(
        str(report_path),
        media_type="application/pdf",
        filename=f"varuna-netra-{report_id}.pdf",
    )