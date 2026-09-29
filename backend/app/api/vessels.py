"""
M4 correlate API (spec section 21: GET /api/vessels/candidates,
GET /api/vessels/{id}/track).

Chains a completed M2 backward analysis (from /api/drift/backward) with a
real GFW AIS pull over the same region/age-window, then scores every
discovered vessel via app/attribution/scoring.py. No synthetic vessel ever
appears here: if GFW's discovery step returns nothing, this endpoint
propagates InsufficientData -- "AIS DATA UNAVAILABLE FOR THIS ANALYSIS
WINDOW" -- as a 404, not an empty-but-successful candidate list.
"""
from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import models
from app.drift.artifact import load_m2_trajectory
from geoalchemy2.shape import to_shape
from sqlalchemy import select
from app.api.drift import _RESULTS as DRIFT_RESULTS
from app.attribution.scoring import score_candidates
from app.config import get_settings
from app.core.exceptions import InsufficientData
from app.db.repository import list_vessels, save_candidate, upsert_vessel
from app.db.session import get_session
from app.providers.ais import get_ais_provider
from app.vessels.filtering import spatial_filter, temporal_filter
from app.vessels.trajectory import group_tracks_by_vessel

router = APIRouter()


@router.get("")
async def get_persisted_vessels(limit: int = 200, session: AsyncSession = Depends(get_session)):
    """Every vessel ever upserted via GET /candidates below, across every
    incident -- a vessel row is created the first time AIS correlation
    encounters that MMSI and is reused (not duplicated) on every subsequent
    incident that vessel shows up in."""
    return {"vessels": await list_vessels(session, limit=limit)}


@router.get("/candidates")
async def get_candidates(
    analysis_id: str = Query(..., description="id returned by POST /api/drift/backward"),
    max_distance_km: float = Query(
    120.0,
    ge=0,
    description="Maximum distance from predicted origin in km."),
    session: AsyncSession = Depends(get_session),
):
        # Prefer the in-process M2 result when available.
    # After a backend restart, recover the M2 trajectory from PostgreSQL
    # metadata + the persistent NetCDF artifact.
    if analysis_id in DRIFT_RESULTS:
        stored = DRIFT_RESULTS[analysis_id]
        origin_analysis = stored["origin_analysis"]
        incident_id = origin_analysis["incident_id"]
        backward_result = stored["raw_result"]

    else:
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

        if not db_analysis.density_field_path:
            raise InsufficientData(
                "M2 trajectory artifact is not persisted for this analysis.",
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

        incident_id = db_analysis.incident_id

        origin_geom = to_shape(db_analysis.probable_origin_geometry)
        centroid = origin_geom.centroid

        origin_analysis = {
            "id": db_analysis.id,
            "incident_id": db_analysis.incident_id,
            "probable_origin_centroid": {
                "lon": float(centroid.x),
                "lat": float(centroid.y),
            },
            "release_start": db_analysis.release_start.isoformat(),
            "release_end": db_analysis.release_end.isoformat(),
            "uncertainty_km": db_analysis.uncertainty_km,
            "ensemble_size": db_analysis.ensemble_size,
            "model_version": db_analysis.model_version,
        }
    # release_start/release_end are the *release* window; observation_time is
    # what was originally passed to /api/drift/backward and isn't stored on
    # origin_analysis directly -- reconstruct it from the backward result's
    # own time axis (its latest timestamp is the observation time, since the
    # run integrates backward from there).
    obs_np = backward_result["time"].values.max()
    observation_time = dt.datetime.utcfromtimestamp(obs_np.astype("datetime64[s]").astype(int))

    release_start = dt.datetime.fromisoformat(origin_analysis["release_start"])
    release_end = dt.datetime.fromisoformat(origin_analysis["release_end"])
    age_min = (observation_time - release_end.replace(tzinfo=None)).total_seconds() / 3600.0
    age_max = (observation_time - release_start.replace(tzinfo=None)).total_seconds() / 3600.0

    centroid = origin_analysis["probable_origin_centroid"]
    origin_centroid = (centroid["lon"], centroid["lat"])

    ais = get_ais_provider()
    bbox = (origin_centroid[0] - 1.5, origin_centroid[1] - 1.5, origin_centroid[0] + 1.5, origin_centroid[1] + 1.5)
    start_iso = (release_start - dt.timedelta(hours=6)).isoformat().replace("+00:00", "Z")
    end_iso = observation_time.isoformat() + "Z"

    points = await ais.get_tracks(bbox, start_iso, end_iso)
    tracks = group_tracks_by_vessel(points)
    tracks = temporal_filter(tracks, release_start, release_end)
    tracks = spatial_filter(tracks, origin_centroid, max_distance_km, observation_time)

    if not tracks:
        raise InsufficientData(
            "AIS DATA UNAVAILABLE FOR THIS ANALYSIS WINDOW",
            note="Vessels were found in the wider region but none survived the spatial/temporal pre-filter.",
        )

    settings = get_settings()
    # slick centroid for trajectory-alignment scoring: the observed slick's
    # own centroid at observation time (hour 0 of the backward ensemble)
    obs_idx = int(backward_result["time"].argmax().values)
    slick_centroid = (
        float(backward_result["lon"].values[:, obs_idx].mean()),
        float(backward_result["lat"].values[:, obs_idx].mean()),
    )

    candidates = score_candidates(
        backward_result, tracks, observation_time, slick_centroid,
        age_hours_min=age_min, age_hours_max=age_max, settings=settings,
    )

    # persist: a Vessel row (upserted -- the same MMSI may recur across
    # incidents) and a Candidate row per scored vessel, linked to the real
    # incident this analysis belongs to.
    for c in candidates:
        # GFW mmsi is the natural key; a vessel with no mmsi at all (name-only
        # match) can't satisfy the schema's Vessel.mmsi primary key, so it is
        # scored (the response still includes it) but not persisted -- this
        # gap is explicit, not silently dropped: `db_id` is left absent.
        if not c.get("mmsi"):
            continue
        vessel = await upsert_vessel(session, mmsi=c["mmsi"], imo=c.get("imo"), name=c.get("name"), vessel_type=c.get("vessel_type"))
        candidate_row = await save_candidate(session, incident_id, vessel.mmsi, c)
        c["db_id"] = candidate_row.id
    await session.commit()

    return {"analysis_id": analysis_id, "candidate_count": len(candidates), "candidates": candidates}
