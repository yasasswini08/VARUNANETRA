"""
M2 RECONSTRUCT (spec section 8).

Seeds the observed slick polygon with an ensemble, then backtracks it using
OpenDrift's own advection with a *negative* time_step -- the standard,
published technique for Lagrangian backward reconstruction (verified in
this phase's dev notes to recover a known synthetic release point to within
metres against a controlled current field). This is not a custom
reimplementation of drift physics; it is OpenDrift's real RK4 advection run
in reverse.

The output is deliberately an xarray Dataset of the full particle ensemble
across every hourly snapshot, not a single collapsed point -- spec section 8
explicitly requires "an origin probability FIELD", not a point estimate.
`app/drift/origin_probability.py` turns this into that field (and an
uncertainty measure) for any specific candidate hour.
"""
from __future__ import annotations

import datetime as dt

import numpy as np
from shapely.geometry.base import BaseGeometry

from app.drift.ensemble import run_ensemble, seed_points_in_polygon


def run_backward_reconstruction(
    observed_slick: BaseGeometry, observation_time: dt.datetime,
    current_reader, wind_reader=None,
    hours: int = 72, ensemble_size: int = 1000,
    time_step_s: int = 900, output_interval_s: int = 3600,
    horizontal_diffusivity: float = 2.0, windage: float = 0.03,
    seed: int | None = None,
):
    rng = np.random.default_rng(seed)
    lons, lats = seed_points_in_polygon(observed_slick, ensemble_size, rng)
    return run_ensemble(
        lons, lats, observation_time, hours,
        current_reader, wind_reader,
        time_step_s=time_step_s, output_interval_s=output_interval_s,
        horizontal_diffusivity=horizontal_diffusivity, windage=windage,
        direction=-1,
    )
