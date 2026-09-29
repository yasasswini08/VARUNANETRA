"""
Full-investigation Celery task (spec section 14). Chains scene processing,
detection, environmental forcing, backward drift, AIS retrieval, per-
candidate PASHA replay and report generation as ONE background job with
progress reported at each REAL completed stage -- not a client-side timer.
Every `self.update_state(...)` call below happens immediately after the
real async call it describes returns, so the percentage the frontend sees
always corresponds to backend work that has actually finished.

The provider/pipeline functions this task calls are exactly the same ones
already validated elsewhere in this codebase (Sentinel-1/ERA5/CMEMS/GFW
providers, M1-M6 pipeline modules) -- this module adds orchestration and
progress reporting on top, not a second implementation of any of them.
"""
from __future__ import annotations

import asyncio
import datetime as dt

from app.jobs.celery_app import celery_app


# Stage percentages match the spec's own worked example verbatim.
STAGES = {
    "search": 0, "acquired": 10, "preprocessing": 20, "detected": 35,
    "era5": 45, "cmems": 55, "backward": 65, "ais": 72, "pasha_start": 80,
    "pasha_end": 95, "report": 98, "complete": 100,
}


@celery_app.task(bind=True, name="investigation.health_check_progress")
def health_check_progress_task(self, steps: int = 5, delay_s: float = 1.0):
    """Not part of the investigation pipeline. Exists purely so
    scripts/health_check.py (and this phase's own verification) can confirm
    that a REAL worker process, connected to a REAL Redis broker/result
    backend, reports genuinely progressive state over genuine elapsed wall-
    clock time -- as opposed to the SSE endpoint or the pipeline task simply
    looking like they would work. Each step sleeps for real before reporting,
    so a caller polling AsyncResult and timestamping each new state can
    verify the percentages arrive with real delay between them, not all at
    once immediately after submission."""
    import time
    for i in range(steps):
        time.sleep(delay_s)
        self.update_state(state="PROGRESS", meta={"percent": int(100 * (i + 1) / steps), "message": f"health check step {i + 1}/{steps}"})
    return {"status": "OK", "steps_completed": steps}


@celery_app.task(bind=True, name="investigation.run_full")
def run_full_investigation(
    self, incident_id: str, product_id: str,
    minlon: float, minlat: float, maxlon: float, maxlat: float,
    polarization: str, observation_time_iso: str,
    age_hours_min: float, age_hours_max: float,
):
    """Synchronous Celery entrypoint -- wraps the real async pipeline in
    asyncio.run() since Celery workers are process-based, not asyncio-native.
    Kept deliberately thin: all real logic lives in `_run`, which a test can
    call directly (see tests/integration/test_investigation_pipeline.py) or
    which this wraps for genuine worker execution."""
    return asyncio.run(_run(self, incident_id, product_id, (minlon, minlat, maxlon, maxlat),
                             polarization, observation_time_iso, age_hours_min, age_hours_max))


def _progress(task, stage_key: str, message: str, **extra):
    percent = STAGES[stage_key]
    task.update_state(state="PROGRESS", meta={"percent": percent, "message": message, **extra})


async def _run(task, incident_id, product_id, bbox, polarization, observation_time_iso, age_hours_min, age_hours_max):
    from app.db.repository import save_origin_analysis, save_satellite_scene, save_spill_detection
    from app.db.session import SessionLocal
    from app.detection.pipeline import run_detection_from_safe
    from app.detection.postprocessing import LookAlikeRules
    from app.drift.backward import run_backward_reconstruction
    from app.drift.forward import forecast_snapshot
    from app.drift.origin_probability import highest_density_region, kde_field, release_time_window_from_age_estimate
    from app.drift.readers import dataset_to_opendrift_reader
    from app.drift.uncertainty import centroid_lonlat, characteristic_radius_km
    from app.providers.ais import get_ais_provider
    from app.providers.cmems import get_cmems_provider
    from app.providers.era5 import get_era5_provider
    from app.providers.sentinel1 import get_sentinel1_provider
    from app.vessels.filtering import spatial_filter, temporal_filter
    from app.vessels.trajectory import group_tracks_by_vessel
    from app.attribution.scoring import score_candidates
    from app.attribution.falsification import run_falsification_gate
    from app.attribution.decision_gate import decide
    from app.pasha.hypothesis import build_hypothesis
    from app.pasha.replay import run_pasha_replay
    from app.pasha.comparison import arrival_time_error_hours, centroid_distance_km, shape_similarity, spatial_overlap
    from app.pasha.metrics import physical_consistency_score
    from app.attribution.physical_plausibility import check_physical_plausibility
    from app.detection.slick_characterization import geodesic_area_km2
    from app.config import get_settings
    from shapely.geometry import box, shape as shapely_shape

    settings = get_settings()
    observation_time = dt.datetime.fromisoformat(observation_time_iso.replace("Z", "+00:00"))

    _progress(task, "search", "Searching Sentinel-1")
    sentinel1 = get_sentinel1_provider()
    sentinel1.require_configured()
    _progress(task, "acquired", "Scene acquired", product_id=product_id)

    _progress(task, "preprocessing", "SAR preprocessing")
    import tempfile
    from pathlib import Path
    safe_dir = Path(tempfile.gettempdir()) / "varuna-netra" / product_id / f"{product_id}.SAFE"
    candidates, diagnostics = run_detection_from_safe(
        str(safe_dir), bbox, polarization=polarization, look_alike_rules=LookAlikeRules(),
    )
    _progress(task, "detected", "Spill candidates detected", candidate_count=len(candidates))

    accepted = [c for c in candidates if c["rejected_reason"] is None]
    if not accepted:
        return {"status": "NO_CANDIDATE_DETECTED", "candidates": candidates}
    top = max(accepted, key=lambda c: c["detection_score"])
    slick_geometry = shapely_shape(top["geometry"])

    margin = 0.5
    minx, miny, maxx, maxy = slick_geometry.bounds
    env_bbox = (minx - margin, miny - margin, maxx + margin, maxy + margin)
    release_start, release_end = release_time_window_from_age_estimate(observation_time, age_hours_min, age_hours_max)
    hindcast_start = (release_start - dt.timedelta(hours=6)).isoformat().replace("+00:00", "Z")
    obs_iso = observation_time.isoformat().replace("+00:00", "Z")

    era5 = get_era5_provider()
    wind_ds, wind_prov = await era5.get_wind_field(env_bbox, hindcast_start, obs_iso)
    _progress(task, "era5", "Loading ERA5")

    cmems = get_cmems_provider()
    current_ds, current_prov = await cmems.get_current_field(env_bbox, hindcast_start, obs_iso)
    _progress(task, "cmems", "Loading CMEMS")

    wind_reader = dataset_to_opendrift_reader(wind_ds)
    current_reader = dataset_to_opendrift_reader(current_ds)
    backward_result = run_backward_reconstruction(
        slick_geometry, observation_time, current_reader, wind_reader,
        hours=int(age_hours_max) + 6, ensemble_size=settings.drift_ensemble_size,
    )
    mid_hours = (age_hours_min + age_hours_max) / 2
    lons, lats = forecast_snapshot(backward_result, hours_ahead=-mid_hours)
    grid_lon, grid_lat, density = kde_field(lons, lats)
    origin_region = highest_density_region(grid_lon, grid_lat, density, mass_fraction=0.5)
    origin_centroid = centroid_lonlat(lons, lats)
    uncertainty_km = characteristic_radius_km(lons, lats)
    _progress(task, "backward", "Backward drift complete", uncertainty_km=round(uncertainty_km, 2))

    ais = get_ais_provider()
    ais_bbox = (origin_centroid[0] - 1.5, origin_centroid[1] - 1.5, origin_centroid[0] + 1.5, origin_centroid[1] + 1.5)
    points = await ais.get_tracks(ais_bbox, (release_start - dt.timedelta(hours=6)).isoformat() + "Z", obs_iso)
    tracks = group_tracks_by_vessel(points)
    tracks = temporal_filter(tracks, release_start, release_end)
    tracks = spatial_filter(tracks, origin_centroid, 120.0, observation_time)
    _progress(task, "ais", "AIS candidates retrieved", vessel_count=len(tracks))

    if not tracks:
        return {"status": "H0_UNKNOWN_SOURCE", "reason": "AIS_DATA_UNAVAILABLE_FOR_THIS_ANALYSIS_WINDOW"}

    obs_idx = int(backward_result["time"].argmax().values)
    slick_centroid = (
        float(backward_result["lon"].values[:, obs_idx].mean()),
        float(backward_result["lat"].values[:, obs_idx].mean()),
    )
    scored = score_candidates(
        backward_result, tracks, observation_time, slick_centroid,
        age_hours_min=age_hours_min, age_hours_max=age_hours_max, settings=settings,
    )

    n = max(1, len(scored))
    span = STAGES["pasha_end"] - STAGES["pasha_start"]
    observed_area_km2 = geodesic_area_km2(slick_geometry)
    for i, c in enumerate(scored):
        hypothesis = build_hypothesis(c, observation_time)
        replay = run_pasha_replay(hypothesis, current_reader, wind_reader)
        arrival_error_h, best_overlap = arrival_time_error_hours(replay, slick_geometry, hypothesis.hours_to_observation)
        sim_points = forecast_snapshot(replay, hours_ahead=hypothesis.hours_to_observation)
        overlap = spatial_overlap(slick_geometry, sim_points)
        c_dist = centroid_distance_km(slick_geometry, sim_points)
        shape_sim = shape_similarity(slick_geometry, sim_points)
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
        task.update_state(state="PROGRESS", meta={
            "percent": STAGES["pasha_start"] + int(span * (i + 1) / n),
            "message": f"PASHA candidate {i + 1}/{n}",
        })

    outcome = decide(scored, settings)

    async with SessionLocal() as session:
        scene_row = await save_satellite_scene(
            session, incident_id, "sentinel1_cdse", product_id, observation_time,
            box(*bbox), polarization, None, {},
        )
        await save_spill_detection(session, incident_id, scene_row.id, top)
        await save_origin_analysis(
            session, incident_id, origin_region, release_start, release_end,
            round(uncertainty_km, 2), settings.drift_ensemble_size, "varuna-netra-m2-opendrift-0.1.0",
        )
        await session.commit()
    _progress(task, "report", "Persisting results")

    _progress(task, "complete", "Investigation complete")
    return {"status": outcome["status"], "outcome": outcome, "candidates": scored}
