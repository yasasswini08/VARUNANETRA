"""
PASHA replay step: forward-simulates a small release patch from a
candidate's hypothesised position/time up to the observation time, using
the exact same real OpenDrift forward-ensemble machinery as M3 (spec
section 11, steps 1-6) -- this is not a separate simulation engine, it's
the same `run_ensemble` core with a small, tightly-clustered seed patch
instead of the whole observed slick, which is what makes it a fair
counterfactual: "if the release had been here instead, what would the
model produce."
"""
from __future__ import annotations

import numpy as np
from shapely.geometry import MultiPoint

from app.drift.ensemble import run_ensemble
from app.drift.forward import forecast_snapshot
from app.pasha.hypothesis import ReleaseHypothesis


def run_pasha_replay(
    hypothesis: ReleaseHypothesis, current_reader, wind_reader=None,
    ensemble_size: int = 300, release_radius_deg: float = 0.003,
    padding_hours: float = 4.0, seed: int | None = None,
):
    """Seeds a small patch (release_radius_deg, ~300 m at these latitudes)
    around the hypothesised release point/time and runs forward past the
    observation time by `padding_hours`, so comparison.py can scan a small
    window around the nominal arrival rather than being locked to exactly
    one instant -- see comparison.py's arrival-time-error metric."""
    seed_patch = MultiPoint([(hypothesis.release_lon, hypothesis.release_lat)]).buffer(release_radius_deg)
    rng = np.random.default_rng(seed)
    from app.drift.ensemble import seed_points_in_polygon
    lons, lats = seed_points_in_polygon(seed_patch, ensemble_size, rng)
    return run_ensemble(
        lons, lats, hypothesis.release_time,
        hypothesis.hours_to_observation + padding_hours,
        current_reader, wind_reader, direction=1,
    )
