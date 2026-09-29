"""
Scientific validation for M5/decision engine (spec sections 11-13), built on
the same true-source-vs-decoy scenario as test_m4_correlate.py. Confirms:

  1. The true-source vessel's PASHA replay survives every hard
     falsification test (spatial, temporal, drift, physical).
  2. The decoy vessel's replay fails at least one hard test.
  3. The decision engine names the true source LEADING, not merely
     "highest scoring" -- it must also have cleared the falsification gate.
  4. When NO real source vessel exists at all (both candidates are decoys),
     the decision engine returns H0_UNKNOWN_SOURCE rather than forcing a
     winner -- the spec's central non-negotiable rule.
"""
from __future__ import annotations

import datetime as dt

import numpy as np
from opendrift.readers import reader_constant
from shapely.geometry import MultiPoint

from app.attribution.physical_plausibility import check_physical_plausibility
from app.attribution.decision_gate import decide
from app.attribution.falsification import run_falsification_gate
from app.attribution.scoring import score_candidates
from app.config import Settings
from app.detection.slick_characterization import geodesic_area_km2
from app.drift.backward import run_backward_reconstruction
from app.drift.forward import forecast_snapshot, run_forward_forecast
from app.pasha.comparison import arrival_time_error_hours, centroid_distance_km, shape_similarity, spatial_overlap
from app.pasha.hypothesis import build_hypothesis
from app.pasha.metrics import physical_consistency_score
from app.pasha.replay import run_pasha_replay
from app.vessels.trajectory import VesselTrack

TRUE_ORIGIN = (68.55, 22.05)
RELEASE_TIME = dt.datetime(2026, 3, 12, 6, 0)
OBSERVATION_TIME = RELEASE_TIME + dt.timedelta(hours=14)
CURRENT_U, CURRENT_V = 0.22, 0.08


def _make_readers():
    return (
        reader_constant.Reader({"x_sea_water_velocity": CURRENT_U, "y_sea_water_velocity": CURRENT_V}),
        reader_constant.Reader({"x_wind": 3.0, "y_wind": -1.5}),
    )


def make_true_vessel_track() -> VesselTrack:
    points = [{"mmsi": "TRUE1", "timestamp": (RELEASE_TIME - dt.timedelta(hours=2)).isoformat() + "Z",
               "lat": TRUE_ORIGIN[1] - 0.004, "lon": TRUE_ORIGIN[0] - 0.01,
               "name": "MT True Source", "vessel_type": "Crude oil tanker"}]
    lon2, lat2 = TRUE_ORIGIN[0] + 0.003, TRUE_ORIGIN[1] + 0.001
    points.append({"mmsi": "TRUE1", "timestamp": (RELEASE_TIME + dt.timedelta(hours=1)).isoformat() + "Z",
                   "lat": lat2, "lon": lon2, "name": "MT True Source", "vessel_type": "Crude oil tanker"})
    dlon_per_h = (CURRENT_U * 3600.0) / (111_320.0 * np.cos(np.radians(TRUE_ORIGIN[1])))
    dlat_per_h = (CURRENT_V * 3600.0) / 110_540.0
    for h in range(2, 15):
        points.append({"mmsi": "TRUE1", "timestamp": (RELEASE_TIME + dt.timedelta(hours=h)).isoformat() + "Z",
                        "lat": lat2 + dlat_per_h * (h - 1), "lon": lon2 + dlon_per_h * (h - 1),
                        "name": "MT True Source", "vessel_type": "Crude oil tanker"})
    return VesselTrack(points)


def make_decoy_vessel_track(mmsi="DECOY1") -> VesselTrack:
    points = []
    for h in range(-4, 20):
        points.append({"mmsi": mmsi, "timestamp": (RELEASE_TIME + dt.timedelta(hours=h)).isoformat() + "Z",
                        "lat": TRUE_ORIGIN[1] + 0.9, "lon": TRUE_ORIGIN[0] - 0.9 + 0.02 * h,
                        "name": "MV Decoy Trader", "vessel_type": "Bulk carrier"})
    return VesselTrack(points)


def _run_pipeline_to_candidates(tracks: dict[str, VesselTrack]):
    current_reader, wind_reader = _make_readers()
    seed_patch = MultiPoint([TRUE_ORIGIN]).buffer(0.0025)
    fwd_result = run_forward_forecast(seed_patch, RELEASE_TIME, current_reader, wind_reader, hours=14, ensemble_size=250, seed=1)
    lons_obs, lats_obs = forecast_snapshot(fwd_result, hours_ahead=14)
    observed_slick = MultiPoint(list(zip(lons_obs, lats_obs))).convex_hull.buffer(0.001)
    slick_centroid = (float(lons_obs.mean()), float(lats_obs.mean()))

    backward_result = run_backward_reconstruction(
        observed_slick, OBSERVATION_TIME, current_reader, wind_reader, hours=20, ensemble_size=400, seed=2,
    )
    settings = Settings(CDS_API_KEY="x", CMEMS_USERNAME="x", CMEMS_PASSWORD="x")
    candidates = score_candidates(
        backward_result, tracks, OBSERVATION_TIME, slick_centroid,
        age_hours_min=6, age_hours_max=30, settings=settings,
    )

    for c in candidates:
        hypothesis = build_hypothesis(c, OBSERVATION_TIME)
        replay = run_pasha_replay(hypothesis, current_reader, wind_reader, ensemble_size=250, seed=3)
        arrival_error_h, best_overlap = arrival_time_error_hours(replay, observed_slick, hypothesis.hours_to_observation)
        sim_points = forecast_snapshot(replay, hours_ahead=hypothesis.hours_to_observation)
        overlap = spatial_overlap(observed_slick, sim_points)
        c_dist = centroid_distance_km(observed_slick, sim_points)
        shape_sim = shape_similarity(observed_slick, sim_points)
        pcs = physical_consistency_score(max(overlap, best_overlap), c_dist, arrival_error_h, shape_sim)
        observed_area_km2 = geodesic_area_km2(observed_slick)
        plausibility = check_physical_plausibility(observed_area_km2, c.get("vessel_type"))
        c["physical_plausibility"] = plausibility
        falsification = run_falsification_gate(
            spatial_overlap=max(overlap, best_overlap), centroid_distance_km=c_dist,
            arrival_time_error_h=arrival_error_h, drift_replay_ran_successfully=True,
            physically_plausible=plausibility["plausible"], behavioural_score=c["behavioural_score"], settings=settings,
        )
        falsification["physical_consistency_score"] = pcs
        c["falsification"] = falsification

    return candidates, settings, observed_slick


def test_true_source_passes_gate_and_becomes_leading():
    tracks = {"TRUE1": make_true_vessel_track(), "DECOY1": make_decoy_vessel_track()}
    candidates, settings, _ = _run_pipeline_to_candidates(tracks)
    by_key = {c["vessel_key"]: c for c in candidates}

    assert by_key["TRUE1"]["falsification"]["pass_fail"] is True, by_key["TRUE1"]["falsification"]
    assert by_key["DECOY1"]["falsification"]["pass_fail"] is False, by_key["DECOY1"]["falsification"]

    outcome = decide(candidates, settings)
    assert outcome["status"] == "LEADING"
    assert outcome["leading_candidate"] == "TRUE1"
    assert by_key["TRUE1"]["status"] == "LEADING"
    assert by_key["DECOY1"]["status"] == "REJECTED"


def test_no_true_source_yields_h0_unknown_source():
    tracks = {"DECOY1": make_decoy_vessel_track("DECOY1"), "DECOY2": make_decoy_vessel_track("DECOY2")}
    candidates, settings, _ = _run_pipeline_to_candidates(tracks)
    outcome = decide(candidates, settings)
    assert outcome["status"] == "H0_UNKNOWN_SOURCE"
    assert outcome["leading_candidate"] is None
    assert all(c["status"] == "REJECTED" for c in candidates)
