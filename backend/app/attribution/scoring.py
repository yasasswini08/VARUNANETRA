"""
M4 correlate / candidate scoring (spec section 10).

For each candidate hour h in the release-time age window, this builds the
KDE origin density field for that hour (from M2's backward ensemble) once,
then samples every vessel's interpolated position at time = observation -
h against it. The (vessel, hour) pair with the highest normalized density
is that vessel's best-fit hypothesis; its four component scores are:

  spatial     -- peak-normalized KDE density at the vessel's position/hour
                 (does the vessel sit inside a high-probability origin area)
  temporal    -- 1.0 if the best-fit hour falls inside the externally
                 supplied age window, decaying linearly outside it
  trajectory  -- cosine alignment between the vessel's own heading around
                 the best-fit hour and the geodesic bearing from that
                 position toward the observed slick's centroid (a cheap
                 proxy for "does this vessel's own path point toward where
                 the spill ended up" -- NOT a physics replay; that's PASHA's
                 job in M5, which is deliberately more expensive and runs
                 only on the candidates that survive this cheaper filter)
  behavioural -- from app/vessels/behaviour.py

Weights are read from Settings (WEIGHT_SPATIAL etc.) so they're operator-
configurable per spec section 10's explicit requirement, not hardcoded here.
"""
from __future__ import annotations

import datetime as dt

import numpy as np
from pyproj import Geod

from app.config import Settings
from app.drift.forward import forecast_snapshot
from app.drift.origin_probability import kde_field
from app.vessels.behaviour import behavioural_score
from app.vessels.trajectory import VesselTrack

_GEOD = Geod(ellps="WGS84")


def _temporal_score(best_hour: float, age_min: float, age_max: float, margin: float = 6.0) -> float:
    if age_min <= best_hour <= age_max:
        return 1.0
    if best_hour < age_min:
        return max(0.0, 1.0 - (age_min - best_hour) / margin)
    return max(0.0, 1.0 - (best_hour - age_max) / margin)


def _heading_at(track: VesselTrack, t: dt.datetime, dt_hours: float = 1.0) -> float | None:
    p0 = track.position_at(t - dt.timedelta(hours=dt_hours / 2))
    p1 = track.position_at(t + dt.timedelta(hours=dt_hours / 2))
    if p0 is None or p1 is None:
        return None
    fwd_az, _, _ = _GEOD.inv(p0[0], p0[1], p1[0], p1[1])
    return fwd_az % 360.0


def _trajectory_alignment(track: VesselTrack, t: dt.datetime, position: tuple[float, float], slick_centroid: tuple[float, float]) -> float:
    heading = _heading_at(track, t)
    if heading is None:
        return 0.5  # no heading evidence either way -- neutral, not penalized
    bearing_to_slick, _, _ = _GEOD.inv(position[0], position[1], slick_centroid[0], slick_centroid[1])
    bearing_to_slick %= 360.0
    diff = abs(heading - bearing_to_slick)
    diff = min(diff, 360 - diff)  # angular difference in [0, 180]
    return float(np.clip(1.0 - diff / 180.0, 0.0, 1.0))


def score_candidates(
    backward_result, tracks: dict[str, VesselTrack],
    observation_time: dt.datetime, slick_centroid: tuple[float, float],
    age_hours_min: float, age_hours_max: float,
    settings: Settings, hour_step: float = 1.0,
) -> list[dict]:
    hours = np.arange(max(1.0, age_hours_min - 4), age_hours_max + 4 + 1e-9, hour_step)

    density_cache: dict[float, tuple[np.ndarray, np.ndarray, np.ndarray]] = {}
    for h in hours:
        lons, lats = forecast_snapshot(backward_result, hours_ahead=-float(h))
        if lons.size < 8:
            continue
        density_cache[float(h)] = kde_field(lons, lats)

    def sample_density(grid_lon, grid_lat, density, lon, lat) -> float:
        i = int(np.clip(np.searchsorted(grid_lon, lon), 0, len(grid_lon) - 1))
        j = int(np.clip(np.searchsorted(grid_lat, lat), 0, len(grid_lat) - 1))
        return float(density[j, i]) if density[j, i] == density[j, i] else 0.0

    results = []
    for key, track in tracks.items():
        best = {"score": -1.0, "hour": None, "position": None, "spatial": 0.0}
        for h, (grid_lon, grid_lat, density) in density_cache.items():
            t = observation_time - dt.timedelta(hours=h)
            pos = track.position_at(t)
            if pos is None:
                continue
            raw_density = sample_density(grid_lon, grid_lat, density, pos[0], pos[1])
            peak = float(density.max())
            spatial = raw_density / peak if peak > 0 else 0.0
            if spatial > best["score"]:
                best = {"score": spatial, "hour": h, "position": pos, "spatial": spatial}

        if best["hour"] is None:
            continue  # vessel never had a position within the AOI during any candidate hour

        t_best = observation_time - dt.timedelta(hours=best["hour"])
        temporal = _temporal_score(best["hour"], age_hours_min, age_hours_max)
        trajectory = _trajectory_alignment(track, t_best, best["position"], slick_centroid)
        behavioural = behavioural_score(track, t_best)

        overall = (
            settings.candidate_weight_spatial * best["spatial"]
            + settings.candidate_weight_temporal * temporal
            + settings.candidate_weight_trajectory * trajectory
            + settings.candidate_weight_behavioural * behavioural
        )

        results.append({
            "vessel_key": key,
            "mmsi": track.mmsi, "imo": track.imo, "name": track.name, "vessel_type": track.vessel_type,
            "best_fit_hour": best["hour"],
            "best_fit_position": {"lon": best["position"][0], "lat": best["position"][1]},
            "spatial_score": round(best["spatial"], 4),
            "temporal_score": round(temporal, 4),
            "trajectory_score": round(trajectory, 4),
            "behavioural_score": round(behavioural, 4),
            "overall_score": round(float(overall), 4),
            "status": "pending",  # decision engine (M5/falsification gate) sets the final status
        })

    results.sort(key=lambda c: c["overall_score"], reverse=True)
    return results
