"""
M5 PASHA API (spec section 21: POST /api/pasha/run, GET /api/pasha/{id}).

Chains M4's scored candidates (from GET /api/vessels/candidates) through a
real forward OpenDrift replay per candidate, the falsification gate, and
the decision engine -- producing the actual attribution status
(LEADING/SECONDARY/AMBIGUOUS/REJECTED/H0_UNKNOWN_SOURCE) spec section 13
requires. Every score here is explicitly a PHYSICAL CONSISTENCY SCORE
(spec section 11's mandated terminology), never framed as a probability of
guilt anywhere in this module or its response schema.
"""
from __future__ import annotations

import datetime as dt
import uuid
from app.db import models
from app.drift.artifact import load_m2_trajectory
from sqlalchemy import select
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from shapely.geometry import Point, shape
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.drift import _RESULTS as DRIFT_RESULTS
from app.attribution.decision_gate import decide
from app.attribution.falsification import run_falsification_gate
from app.config import get_settings
from app.core.exceptions import InsufficientData
from app.core.logging import get_logger
from app.attribution.physical_plausibility import check_physical_plausibility
from app.db.repository import save_falsification_result, save_pasha_run, update_candidate_status
from app.db.session import get_session
from app.detection.slick_characterization import geodesic_area_km2
from app.pasha.comparison import arrival_time_error_hours, centroid_distance_km, shape_similarity, spatial_overlap
from app.pasha.hypothesis import build_hypothesis
from app.pasha.metrics import physical_consistency_score
from app.pasha.replay import run_pasha_replay
from app.drift.forward import forecast_snapshot
from app.drift.readers import dataset_to_opendrift_reader
from app.providers.cmems import get_cmems_provider
from app.providers.era5 import get_era5_provider

router = APIRouter()
log = get_logger(__name__)

_RESULTS: dict[str, dict] = {}


@router.get("")
async def list_pasha_runs(incident_id: str | None = None, limit: int = 100, session: AsyncSession = Depends(get_session)):
    """Gap-analysis section 10 ("PASHA history"): every completed run,
    optionally filtered to one incident, for a PASHA Simulation Lab screen
    -- reads the same persisted PashaRunResult rows GET /{run_id} already
    serves, so a run listed here is guaranteed re-fetchable in full."""
    from app.core.validation import validate_uuid_filter
    from app.db.repository import list_pasha_run_history
    validate_uuid_filter(incident_id)
    return {"runs": await list_pasha_run_history(session, incident_id=incident_id, limit=limit)}


class PashaRunRequest(BaseModel):
    analysis_id: str
    candidates: list[dict]
    observed_slick_geometry: dict


@router.post("/run")
async def run_pasha(req: PashaRunRequest, session: AsyncSession = Depends(get_session)):
    """`candidates` should be the list returned by GET
    /api/vessels/candidates (each with vessel_key/best_fit_hour/
    best_fit_position/behavioural_score, and -- if that call reached a real
    database -- a `db_id` this endpoint uses to persist the PASHA/
    falsification result and update the Candidate's final status).
    `observed_slick_geometry` is the GeoJSON polygon originally passed to
    /api/drift/backward -- required again here since it isn't retained on
    the stored analysis."""
    analysis_id = req.analysis_id
    candidates = req.candidates
    observed_slick_geometry = req.observed_slick_geometry
    if not candidates:
        raise InsufficientData(
            "No candidates supplied -- call GET /api/vessels/candidates first.",
            analysis_id=analysis_id,
        )

    if analysis_id in DRIFT_RESULTS:
        stored = DRIFT_RESULTS[analysis_id]
        origin_analysis = stored["origin_analysis"]
        backward_result = stored["raw_result"]

    else:
        db_result = await session.execute(
            select(models.OriginAnalysis).where(
                models.OriginAnalysis.id == analysis_id
            )
        )
        db_analysis = db_result.scalar_one_or_none()

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

        origin_analysis = {
            "id": db_analysis.id,
            "incident_id": db_analysis.incident_id,
            "release_start": db_analysis.release_start.isoformat(),
            "release_end": db_analysis.release_end.isoformat(),
            "uncertainty_km": db_analysis.uncertainty_km,
            "ensemble_size": db_analysis.ensemble_size,
            "model_version": db_analysis.model_version,
        }
    if not observed_slick_geometry:
        raise InsufficientData("observed_slick_geometry is required to score PASHA replays against.", analysis_id=analysis_id)

    settings = get_settings()


    if observed_slick_geometry.get("type") != "Polygon":
        raise InsufficientData(
            "observed_slick_geometry must be a GeoJSON Polygon.",
            analysis_id=analysis_id,
        )

    coordinates = observed_slick_geometry.get("coordinates")

    if (
        not isinstance(coordinates, list)
        or len(coordinates) == 0
        or not isinstance(coordinates[0], list)
        or len(coordinates[0]) < 4
        or not isinstance(coordinates[0][0], list)
        or len(coordinates[0][0]) != 2
    ):
        raise InsufficientData(
            "observed_slick_geometry has invalid GeoJSON Polygon coordinates.",
            analysis_id=analysis_id,
        )

    observed_slick = shape(observed_slick_geometry)

    obs_np = backward_result["time"].values.max()
    observation_time = dt.datetime.utcfromtimestamp(obs_np.astype("datetime64[s]").astype(int))

    minx, miny, maxx, maxy = observed_slick.bounds
    margin = 1.0
    bbox = (minx - margin, miny - margin, maxx + margin, maxy + margin)
    era5 = get_era5_provider()
    cmems = get_cmems_provider()
    max_hour = max(c["best_fit_hour"] for c in candidates) + 6
    start_iso = (observation_time - dt.timedelta(hours=max_hour)).isoformat() + "Z"
    end_iso = observation_time.isoformat() + "Z"
    wind_ds, _ = await era5.get_wind_field(bbox, start_iso, end_iso)
    current_ds, _ = await cmems.get_current_field(bbox, start_iso, end_iso)
    wind_reader = dataset_to_opendrift_reader(wind_ds)
    current_reader = dataset_to_opendrift_reader(current_ds)

    observed_area_km2 = geodesic_area_km2(observed_slick)

    for c in candidates:
        hypothesis = build_hypothesis(c, observation_time)
        replay = run_pasha_replay(hypothesis, current_reader, wind_reader)
        arrival_error_h, best_overlap = arrival_time_error_hours(replay, observed_slick, hypothesis.hours_to_observation)
        sim_points = forecast_snapshot(replay, hours_ahead=hypothesis.hours_to_observation)
        overlap = spatial_overlap(observed_slick, sim_points)
        c_dist = centroid_distance_km(observed_slick, sim_points)
        shape_sim = shape_similarity(observed_slick, sim_points)
        pcs = physical_consistency_score(max(overlap, best_overlap), c_dist, arrival_error_h, shape_sim)

        plausibility = check_physical_plausibility(observed_area_km2, c.get("vessel_type"))
        c["physical_plausibility"] = plausibility

        falsification = run_falsification_gate(
            spatial_overlap=max(overlap, best_overlap), centroid_distance_km=c_dist,
            arrival_time_error_h=arrival_error_h, drift_replay_ran_successfully=True,
            physically_plausible=plausibility["plausible"], behavioural_score=c.get("behavioural_score", 0.0), settings=settings,
        )
        falsification["physical_consistency_score"] = pcs
        c["falsification"] = falsification
        c["_pasha_metrics"] = {
            "spatial_overlap": max(overlap, best_overlap),
            "centroid_distance_km": c_dist,
            "arrival_time_error_h": arrival_error_h,
        }

    outcome = decide(candidates, settings)

    # persist: a PashaRun + FalsificationResult per candidate that has a
    # real Candidate row behind it (db_id set by GET /api/vessels/candidates
    # when that call reached a database), then the decision engine's final
    # status back onto that same Candidate row.
    for c in candidates:
        if not c.get("db_id"):
            continue
        release_point = Point(c["best_fit_position"]["lon"], c["best_fit_position"]["lat"])
        release_time = observation_time - dt.timedelta(hours=c["best_fit_hour"])
        metrics = c["_pasha_metrics"]
        pasha_row = await save_pasha_run(
            session, c["db_id"], release_point, release_time, {"ensemble_size": 250}, None,
            spatial_overlap=metrics["spatial_overlap"],
            centroid_distance_km=metrics["centroid_distance_km"],
            temporal_error_h=metrics["arrival_time_error_h"],
            consistency_score=c["falsification"]["physical_consistency_score"],
        )
        await save_falsification_result(session, pasha_row.id, c["falsification"])
        await update_candidate_status(session, c["db_id"], c["status"])
    await session.commit()

    for c in candidates:
        c.pop("_pasha_metrics", None)

    run_id = str(uuid.uuid4())

    result = {
        "run_id": run_id,
        "analysis_id": analysis_id,
        "outcome": outcome,
        "candidates": candidates,
    }

    # Persist the exact API response so GET remains available
    # after backend/container restart.
    pasha_result_row = models.PashaRunResult(
        id=run_id,
        analysis_id=analysis_id,
        result=result,
    )

    session.add(pasha_result_row)
    await session.commit()

    # Keep the in-memory fast path as well.
    _RESULTS[run_id] = result

    log.info(
        "m5_pasha_complete",
        run_id=run_id,
        outcome_status=outcome["status"],
    )

    return result


@router.get("/{run_id}")
async def get_pasha_run(
    run_id: str,
    session: AsyncSession = Depends(get_session),
):
    # Fast path: result is still in this backend process.
    if run_id in _RESULTS:
        return _RESULTS[run_id]

    # Restart-safe fallback: load the exact API result from PostgreSQL.
    db_result = await session.execute(
        select(models.PashaRunResult).where(
            models.PashaRunResult.id == run_id
        )
    )

    row = db_result.scalar_one_or_none()

    if row is None:
        raise InsufficientData(
            "No PASHA run found in persistent storage.",
            run_id=run_id,
        )

    # Restore the result into memory for subsequent requests.
    _RESULTS[run_id] = row.result

    return row.result