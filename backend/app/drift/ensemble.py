"""
Shared OceanDrift configuration and execution, used identically by
backward.py (negative time_step -- see the verified backtracking technique
in this phase's dev notes) and forward.py (positive time_step). Keeping one
function means the two directions can never accidentally diverge in how
advection, diffusion or land handling are configured -- important, since a
mismatch there would make PASHA's later observed-vs-simulated comparison
(M5) compare two runs that were never physically equivalent in the first
place.
"""
from __future__ import annotations

import datetime as dt

import numpy as np
from shapely.geometry import Point
from shapely.geometry.base import BaseGeometry


def seed_points_in_polygon(polygon: BaseGeometry, n: int, rng: np.random.Generator) -> tuple[np.ndarray, np.ndarray]:
    """Rejection-samples n points uniformly within polygon's area (not just
    its bounding box) -- important for an elongated slick, where most of the
    bounding box is empty and naive bbox sampling would waste most draws
    outside the polygon and, worse, bias the retained sample toward the
    box's corners-adjacent regions if a draw cap were hit early."""
    minx, miny, maxx, maxy = polygon.bounds
    lons: list[float] = []
    lats: list[float] = []
    attempts = 0
    max_attempts = n * 200
    while len(lons) < n and attempts < max_attempts:
        batch = min(4 * (n - len(lons)), 5000)
        xs = rng.uniform(minx, maxx, batch)
        ys = rng.uniform(miny, maxy, batch)
        attempts += batch
        for x, y in zip(xs, ys):
            if len(lons) >= n:
                break
            if polygon.contains(Point(x, y)):
                lons.append(x)
                lats.append(y)
    if len(lons) < n:
        raise ValueError(
            f"Could not sample {n} interior points from polygon after {max_attempts} attempts "
            f"(got {len(lons)}) -- polygon may be degenerate or numerically tiny."
        )
    return np.array(lons), np.array(lats)


def run_ensemble(
    lons: np.ndarray, lats: np.ndarray, start_time: dt.datetime,
    hours: float, current_reader, wind_reader=None,
    time_step_s: int = 900, output_interval_s: int = 3600,
    horizontal_diffusivity: float = 2.0, windage: float = 0.03,
    direction: int = 1,
):
    """direction=+1 forward, -1 backward. `windage` is the fraction of wind
    speed added to surface drift, applied via OpenDrift's own
    wind_drift_factor config rather than hand-added to the current field --
    this is the physically standard place for it and lets OpenDrift's own
    Stokes-drift/wind-drift machinery interact with it correctly rather than
    double-counting."""
    from opendrift.models.oceandrift import OceanDrift

    o = OceanDrift(loglevel=50)
    o.add_reader(current_reader)
    if wind_reader is not None:
        o.add_reader(wind_reader)

    o.set_config("drift:advection_scheme", "runge-kutta4")
    o.set_config("environment:fallback:horizontal_diffusivity", horizontal_diffusivity)
    o.set_config("seed:wind_drift_factor", windage)
    o.set_config("environment:fallback:land_binary_mask", 0)
    o.set_config("environment:fallback:x_wind", 0.0)
    o.set_config("environment:fallback:y_wind", 0.0)

    # OpenDrift reader timestamps are naive UTC; normalize the seed time to naive UTC.
    if start_time.tzinfo is not None:
        start_time = start_time.astimezone(dt.timezone.utc).replace(tzinfo=None)

    o.seed_elements(lon=lons, lat=lats, time=start_time)
    o.run(
        duration=dt.timedelta(hours=hours),
        time_step=direction * time_step_s,
        time_step_output=output_interval_s,
    )
    return o.result
