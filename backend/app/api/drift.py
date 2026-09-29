"""
M2/M3 drift API (spec section 21: POST /api/drift/backward, GET /api/drift/{id},
POST /api/drift/forecast).

Both endpoints pull REAL ERA5 wind and CMEMS current fields through the
phase 4/5 providers -- there is no synthetic forcing option here at all, in
either APP_MODE. A request with no CDS_API_KEY/CMEMS credentials configured
fails with 424 PROVIDER_NOT_CONFIGURED before OpenDrift is ever invoked, via
the same require_configured() guard used everywhere else in this codebase.

As with detection.py before its phase-17 rewiring, results are ALSO held in
a process-local dict (needed so /api/vessels/candidates and /api/pasha/run
can retrieve the live xarray ensemble Dataset and OpenDrift reader objects,
neither of which is something PostGIS stores) -- but the OriginAnalysis
summary itself is now a real, committed PostGIS row, not process-memory-only.
"""
from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from shapely.geometry import shape
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.exceptions import InsufficientData, InvalidGeometry
from app.db import models
from sqlalchemy import select
from app.core.logging import get_logger
from app.core.provenance import DataKind, Provenance
from app.db.repository import save_origin_analysis
from app.db.session import get_session
from app.drift.backward import run_backward_reconstruction
from app.drift.forward import forecast_snapshot, run_forward_forecast
from app.drift.origin_probability import (
    highest_density_region, kde_field, release_time_window_from_age_estimate,
)
from app.drift.readers import dataset_to_opendrift_reader
from app.drift.uncertainty import centroid_lonlat, characteristic_radius_km
from app.providers.cmems import get_cmems_provider
from app.providers.era5 import get_era5_provider

router = APIRouter()
log = get_logger(__name__)

_RESULTS: dict[str, dict] = {}


class BackwardRequest(BaseModel):
    incident_id: str
    slick_geometry: dict = Field(..., description="GeoJSON polygon of the observed slick")
    observation_time: dt.datetime
    age_hours_min: float = 6.0
    age_hours_max: float = 30.0
    ensemble_size: int | None = None
    bbox_margin_deg: float = 0.5


@router.post("/backward")
async def backward(req: BackwardRequest, session: AsyncSession = Depends(get_session)):
    settings = get_settings()
    try:
        polygon = shape(req.slick_geometry)
    except Exception as exc:
        raise InvalidGeometry(
            "slick_geometry must be valid GeoJSON geometry.",
            field="slick_geometry",
        ) from exc

    if polygon.geom_type != "Polygon":
        raise InvalidGeometry(
            "slick_geometry must be a GeoJSON Polygon.",
            field="slick_geometry",
        )

    if polygon.is_empty or not polygon.is_valid:
        raise InvalidGeometry(
            "slick_geometry must be a non-empty valid Polygon.",
            field="slick_geometry",
        )

    result = await session.execute(
        select(models.Incident).where(
            models.Incident.id == req.incident_id
        )
    )

    incident = result.scalar_one_or_none()

    if incident is None:
        raise InsufficientData(
            "No incident found with this id.",
            incident_id=req.incident_id,
        )

    minx, miny, maxx, maxy = polygon.bounds
    m = req.bbox_margin_deg
    bbox = (minx - m, miny - m, maxx + m, maxy + m)

    release_start, release_end = release_time_window_from_age_estimate(
        req.observation_time, req.age_hours_min, req.age_hours_max
    )
    hindcast_start = (release_start - dt.timedelta(hours=6)).isoformat().replace("+00:00", "Z")
    obs_iso = req.observation_time.isoformat().replace("+00:00", "Z")

    era5 = get_era5_provider()
    cmems = get_cmems_provider()
    wind_ds, wind_prov = await era5.get_wind_field(bbox, hindcast_start, obs_iso)
    current_ds, current_prov = await cmems.get_current_field(bbox, hindcast_start, obs_iso)

    wind_reader = dataset_to_opendrift_reader(wind_ds)
    current_reader = dataset_to_opendrift_reader(current_ds)

    ensemble_size = req.ensemble_size or settings.drift_ensemble_size
    result = run_backward_reconstruction(
        polygon, req.observation_time, current_reader, wind_reader,
        hours=int(req.age_hours_max) + 6, ensemble_size=ensemble_size,
    )

    # origin field at the midpoint of the age window -- the whole per-hour
    # field is retrievable from `result` for M4 to sample at any candidate
    # hour within [age_hours_min, age_hours_max], not just this one summary.
    mid_hours = (req.age_hours_min + req.age_hours_max) / 2
    lons, lats = forecast_snapshot(result, hours_ahead=-mid_hours)
    grid_lon, grid_lat, density = kde_field(lons, lats)
    origin_region = highest_density_region(grid_lon, grid_lat, density, mass_fraction=0.5)
    centroid = centroid_lonlat(lons, lats)
    uncertainty_km = characteristic_radius_km(lons, lats)

    model_version = "varuna-netra-m2-opendrift-0.1.0"
    provenance = {
        "wind": wind_prov.model_dump(mode="json"),
        "current": current_prov.model_dump(mode="json"),
    }

    db_row = await save_origin_analysis(
        session,
        req.incident_id,
        origin_region,
        release_start,
        release_end,
        round(uncertainty_km, 2),
        ensemble_size,
        model_version,
        observation_time=req.observation_time,
        observed_slick_geometry=polygon,
        provenance=provenance,
    )
    analysis_id = db_row.id

    from app.drift.artifact import save_m2_trajectory

    artifact_path = save_m2_trajectory(result, analysis_id)
    db_row.density_field_path = artifact_path

    await session.commit()
    origin_analysis = {
        "id": analysis_id,
        "incident_id": req.incident_id,
        "probable_origin_geometry": origin_region.__geo_interface__ if origin_region else None,
        "probable_origin_centroid": {"lon": centroid[0], "lat": centroid[1]},
        "release_start": release_start.isoformat(),
        "release_end": release_end.isoformat(),
        "uncertainty_km": round(uncertainty_km, 2),
        "ensemble_size": ensemble_size,
        "model_version": model_version,
        "provenance": provenance,
    }
    _RESULTS[analysis_id] = {
        "origin_analysis": origin_analysis, "raw_result": result,
        "current_reader": current_reader, "wind_reader": wind_reader,
    }
    log.info("m2_reconstruct_complete", analysis_id=analysis_id, uncertainty_km=uncertainty_km, persisted=True)
    return origin_analysis


@router.get("/{analysis_id}")
async def get_drift(
    analysis_id: str,
    session: AsyncSession = Depends(get_session),
):
    from app.core.exceptions import InsufficientData
    from app.db import models
    from geoalchemy2.shape import to_shape
    from sqlalchemy import select

    # Fast path: analysis still exists in this backend process.
    if analysis_id in _RESULTS:
        return _RESULTS[analysis_id]["origin_analysis"]

    # Restart-safe path: recover the persisted M2 metadata from PostgreSQL.
    result = await session.execute(
        select(models.OriginAnalysis).where(
            models.OriginAnalysis.id == analysis_id
        )
    )
    db_analysis = result.scalar_one_or_none()

    if db_analysis is None:
        raise InsufficientData(
            "No drift analysis found in persistent storage.",
            analysis_id=analysis_id,
        )

    origin_analysis = {
        "id": db_analysis.id,
        "incident_id": db_analysis.incident_id,
        "probable_origin_geometry": (
            to_shape(db_analysis.probable_origin_geometry).__geo_interface__
            if db_analysis.probable_origin_geometry is not None
            else None
        ),
        "probable_origin_centroid": (
            {
                "lon": float(to_shape(db_analysis.probable_origin_geometry).centroid.x),
                "lat": float(to_shape(db_analysis.probable_origin_geometry).centroid.y),
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
        "density_field_path": db_analysis.density_field_path,
        "provenance": db_analysis.provenance or {},
    }

    return origin_analysis


class ForecastRequest(BaseModel):
    analysis_id: str
    forecast_hours: list[int] = Field(default_factory=lambda: [24, 48, 72])


@router.post("/forecast")
async def forecast(
    req: ForecastRequest,
    session: AsyncSession = Depends(get_session),
):
    """Seeds the forward forecast from the *observed slick*, not the
    reconstructed origin -- M3's job (spec section 9) is "where does the
    current slick go next", which is what responders need, not a replay of
    M2's already-uncertain backward path run forward again."""
    from app.core.exceptions import InsufficientData

    settings = get_settings()

    if req.analysis_id in _RESULTS:
        stored = _RESULTS[req.analysis_id]
        raw_result = stored["raw_result"]

    else:
        from app.db import models
        from app.drift.artifact import load_m2_trajectory
        from sqlalchemy import select

        db_result = await session.execute(
            select(models.OriginAnalysis).where(
                models.OriginAnalysis.id == req.analysis_id
            )
        )
        db_analysis = db_result.scalar_one_or_none()

        if db_analysis is None:
            raise InsufficientData(
                "No drift analysis found in persistent storage.",
                analysis_id=req.analysis_id,
            )

        if not db_analysis.density_field_path:
            raise InsufficientData(
                "M2 trajectory artifact is not persisted for this analysis.",
                analysis_id=req.analysis_id,
            )

        try:
            raw_result = load_m2_trajectory(
                db_analysis.density_field_path
            )
        except FileNotFoundError as exc:
            raise InsufficientData(
                "M2 trajectory artifact is missing.",
                analysis_id=req.analysis_id,
                path=db_analysis.density_field_path,
            ) from exc

    # Seed from the *observed slick* -- the ensemble's position at the most
    # recent (least-negative) backward output step is the observation-time
    # position, i.e. the original observed slick footprint.
    import numpy as np
    from shapely.geometry import MultiPoint

    obs_index = int(raw_result["time"].argmax().values)  # backward run: latest time == observation time
    lons0 = raw_result["lon"].values[:, obs_index]
    lats0 = raw_result["lat"].values[:, obs_index]
    valid = np.isfinite(lons0) & np.isfinite(lats0)
    seed_geom = MultiPoint(list(zip(lons0[valid], lats0[valid]))).convex_hull.buffer(0.001)
    start_time_np = raw_result["time"].values[obs_index]
    start_time = dt.datetime.utcfromtimestamp(start_time_np.astype("datetime64[s]").astype(int))

    # The readers stored from the backward call only cover the hindcast
    # window (...up to observation_time) -- forecasting forward needs FRESH
    # ERA5/CMEMS data spanning observation_time -> observation_time+max_h,
    # not a reuse of forcing that stops exactly where this forecast starts.
    minx, miny, maxx, maxy = seed_geom.bounds
    margin = 0.5
    bbox = (minx - margin, miny - margin, maxx + margin, maxy + margin)
    max_h = max(req.forecast_hours)
    fwd_end = (start_time + dt.timedelta(hours=max_h)).isoformat() + "Z"
    fwd_start = start_time.isoformat() + "Z"

    era5 = get_era5_provider()
    cmems = get_cmems_provider()
    wind_ds, wind_prov = await era5.get_wind_field(bbox, fwd_start, fwd_end)
    current_ds, current_prov = await cmems.get_current_field(bbox, fwd_start, fwd_end)
    forward_wind_reader = dataset_to_opendrift_reader(wind_ds)
    forward_current_reader = dataset_to_opendrift_reader(current_ds)

    fwd_result = run_forward_forecast(
        seed_geom, start_time,
        forward_current_reader, forward_wind_reader,
        hours=max_h, ensemble_size=settings.drift_ensemble_size,
    )

    forecasts = {}
    for h in req.forecast_hours:
        lons_h, lats_h = forecast_snapshot(fwd_result, hours_ahead=h)
        footprint = MultiPoint(list(zip(lons_h, lats_h))).convex_hull
        forecasts[f"+{h}h"] = {
            "geometry": footprint.__geo_interface__,
            "centroid": {"lon": float(lons_h.mean()), "lat": float(lats_h.mean())},
            "spread_km": characteristic_radius_km(lons_h, lats_h),
        }

    return {
        "analysis_id": req.analysis_id,
        "seeded_from": "observed_slick",
        "forecast_hours": req.forecast_hours,
        "forecasts": forecasts,
        "provenance": {"wind": wind_prov.model_dump(mode="json"), "current": current_prov.model_dump(mode="json")},
    }
