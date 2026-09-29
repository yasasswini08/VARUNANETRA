"""
M3 FORECAST (spec section 9).

Runs the same ensemble machinery forward from a set of seed points -- either
the reconstructed origin (M2's output at a chosen candidate release hour)
or, for a simpler "where does the currently observed slick go next" product,
the observed slick polygon itself. Both are valid seed sources for the same
function; which one a caller uses depends on whether the question is
"where did the source vessel actually pass through" (seed from M2's origin
region) or "what should responders expect over the next 24-72h" (seed from
the observed slick).
"""
from __future__ import annotations

import datetime as dt

import numpy as np
from shapely.geometry.base import BaseGeometry

from app.drift.ensemble import run_ensemble, seed_points_in_polygon


def run_forward_forecast(
    seed_geometry: BaseGeometry, start_time: dt.datetime,
    current_reader, wind_reader=None,
    hours: int = 72, ensemble_size: int = 1000,
    time_step_s: int = 900, output_interval_s: int = 3600,
    horizontal_diffusivity: float = 2.0, windage: float = 0.03,
    seed: int | None = None,
):
    rng = np.random.default_rng(seed)
    lons, lats = seed_points_in_polygon(seed_geometry, ensemble_size, rng)
    return run_ensemble(
        lons, lats, start_time, hours,
        current_reader, wind_reader,
        time_step_s=time_step_s, output_interval_s=output_interval_s,
        horizontal_diffusivity=horizontal_diffusivity, windage=windage,
        direction=1,
    )


def forecast_snapshot(result_ds, hours_ahead: int) -> tuple[np.ndarray, np.ndarray]:
    """Returns (lons, lats) of every particle at the output step closest to
    `hours_ahead` after the seed time -- e.g. hours_ahead=24 for the +24h
    forecast footprint spec section 9 asks for."""
    t0 = result_ds["time"].values[0]
    target = t0 + np.timedelta64(int(round(hours_ahead * 3600)), "s")
    idx = int(np.argmin(np.abs(result_ds["time"].values - target)))
    lons = result_ds["lon"].values[:, idx]
    lats = result_ds["lat"].values[:, idx]
    valid = np.isfinite(lons) & np.isfinite(lats)
    return lons[valid], lats[valid]
