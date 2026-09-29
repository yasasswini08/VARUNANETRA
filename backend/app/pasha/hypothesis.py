"""
PASHA (Physics-Anchored Spill Hypothesis Adjudication) — hypothesis step.

Turns a scored M4 candidate (spec section 10's output: a best-fit hour and
position) into a concrete, testable release hypothesis: "if this vessel
released oil at this position at this time, forward-simulating from there
should reproduce the observed slick." replay.py runs that simulation;
comparison.py and metrics.py score how well it matches.
"""
from __future__ import annotations

import dataclasses
import datetime as dt


@dataclasses.dataclass
class ReleaseHypothesis:
    vessel_key: str
    release_lon: float
    release_lat: float
    release_time: dt.datetime
    hours_to_observation: float


def build_hypothesis(candidate: dict, observation_time: dt.datetime) -> ReleaseHypothesis:
    pos = candidate["best_fit_position"]
    hour = candidate["best_fit_hour"]
    return ReleaseHypothesis(
        vessel_key=candidate["vessel_key"],
        release_lon=pos["lon"], release_lat=pos["lat"],
        release_time=observation_time - dt.timedelta(hours=hour),
        hours_to_observation=hour,
    )
