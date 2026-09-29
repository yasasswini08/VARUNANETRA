"""
Scientific validation for M4 correlate (spec section 10) built on top of the
same real backward-reconstruction machinery validated in
test_drift_reconstruction.py. Confirms `score_candidates` ranks a vessel
that was genuinely near the reconstructed origin at a plausible hour above
a decoy vessel that was never near it -- the central claim the whole
correlate stage exists to support.
"""
from __future__ import annotations

import datetime as dt

import numpy as np
from opendrift.readers import reader_constant
from shapely.geometry import MultiPoint

from app.attribution.scoring import score_candidates
from app.config import Settings
from app.drift.backward import run_backward_reconstruction
from app.drift.forward import forecast_snapshot, run_forward_forecast
from app.vessels.trajectory import VesselTrack

TRUE_ORIGIN = (68.55, 22.05)
RELEASE_TIME = dt.datetime(2026, 3, 12, 6, 0)
OBSERVATION_TIME = RELEASE_TIME + dt.timedelta(hours=14)
CURRENT_U, CURRENT_V = 0.22, 0.08  # m/s, matches the reader below


def _make_readers():
    return (
        reader_constant.Reader({"x_sea_water_velocity": CURRENT_U, "y_sea_water_velocity": CURRENT_V}),
        reader_constant.Reader({"x_wind": 3.0, "y_wind": -1.5}),
    )


def _deg_per_hour(u_ms: float, lat: float) -> tuple[float, float]:
    """crude m/s -> deg/hour conversion at a given latitude, good enough
    for building a synthetic vessel track that drifts roughly with the
    current."""
    return (u_ms * 3600.0) / (111_320.0 * np.cos(np.radians(lat))), None


def make_true_vessel_track() -> VesselTrack:
    """A vessel that sits almost exactly at the true origin at the release
    hour, then drifts onward roughly with the current (as a ship idling in
    a current would), with a slow-speed segment right at release."""
    points = []
    lon, lat = TRUE_ORIGIN[0] - 0.01, TRUE_ORIGIN[1] - 0.004  # ~1.3 km short of origin, approaching it
    points.append({"mmsi": "TRUE1", "timestamp": (RELEASE_TIME - dt.timedelta(hours=2)).isoformat() + "Z",
                   "lat": lat, "lon": lon, "name": "MT True Source", "vessel_type": "Crude oil tanker"})
    # slow segment spanning the release hour (small displacement over 2h -> low speed)
    lon2, lat2 = TRUE_ORIGIN[0] + 0.003, TRUE_ORIGIN[1] + 0.001
    points.append({"mmsi": "TRUE1", "timestamp": (RELEASE_TIME + dt.timedelta(hours=1)).isoformat() + "Z",
                   "lat": lat2, "lon": lon2, "name": "MT True Source", "vessel_type": "Crude oil tanker"})
    # then resumes drifting roughly with the current toward where the slick ends up
    dlon_per_h = (CURRENT_U * 3600.0) / (111_320.0 * np.cos(np.radians(TRUE_ORIGIN[1])))
    dlat_per_h = (CURRENT_V * 3600.0) / 110_540.0
    for h in range(2, 15):
        points.append({
            "mmsi": "TRUE1",
            "timestamp": (RELEASE_TIME + dt.timedelta(hours=h)).isoformat() + "Z",
            "lat": lat2 + dlat_per_h * (h - 1), "lon": lon2 + dlon_per_h * (h - 1),
            "name": "MT True Source", "vessel_type": "Crude oil tanker",
        })
    return VesselTrack(points)


def make_decoy_vessel_track() -> VesselTrack:
    """A vessel that is never near the true origin during the plausible age
    window, and only passes near it long after (outside the window),
    heading in a direction unrelated to the drift."""
    points = []
    for h in range(-4, 20):
        points.append({
            "mmsi": "DECOY1",
            "timestamp": (RELEASE_TIME + dt.timedelta(hours=h)).isoformat() + "Z",
            "lat": TRUE_ORIGIN[1] + 0.9, "lon": TRUE_ORIGIN[0] - 0.9 + 0.02 * h,  # far away, moving NW->SE unrelated
            "name": "MV Decoy Trader", "vessel_type": "Bulk carrier",
        })
    return VesselTrack(points)


def test_true_source_outscores_decoy():
    current_reader, wind_reader = _make_readers()

    seed_patch = MultiPoint([TRUE_ORIGIN]).buffer(0.0025)
    fwd_result = run_forward_forecast(seed_patch, RELEASE_TIME, current_reader, wind_reader, hours=14, ensemble_size=250, seed=1)
    lons_obs, lats_obs = forecast_snapshot(fwd_result, hours_ahead=14)
    observed_slick = MultiPoint(list(zip(lons_obs, lats_obs))).convex_hull.buffer(0.001)
    slick_centroid = (float(lons_obs.mean()), float(lats_obs.mean()))

    backward_result = run_backward_reconstruction(
        observed_slick, OBSERVATION_TIME, current_reader, wind_reader, hours=20, ensemble_size=400, seed=2,
    )

    tracks = {"TRUE1": make_true_vessel_track(), "DECOY1": make_decoy_vessel_track()}
    settings = Settings(CDS_API_KEY="x", CMEMS_USERNAME="x", CMEMS_PASSWORD="x")  # values irrelevant to scoring math
    candidates = score_candidates(
        backward_result, tracks, OBSERVATION_TIME, slick_centroid,
        age_hours_min=6, age_hours_max=30, settings=settings,
    )

    by_key = {c["vessel_key"]: c for c in candidates}
    assert "TRUE1" in by_key and "DECOY1" in by_key
    assert by_key["TRUE1"]["overall_score"] > by_key["DECOY1"]["overall_score"], (
        f"true-source vessel should outscore decoy: {by_key}"
    )
    assert by_key["TRUE1"]["overall_score"] > 0.5
    assert by_key["DECOY1"]["spatial_score"] < by_key["TRUE1"]["spatial_score"]
    assert candidates[0]["vessel_key"] == "TRUE1", "true source should rank first overall"
