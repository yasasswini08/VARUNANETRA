"""
Falsification gate (spec section 12).

Four HARD tests -- spatial, temporal, drift, physical -- any one of which
failing means the candidate cannot become LEADING, no matter how high its
raw score is elsewhere. Behavioural evidence is explicitly SUPPORTING ONLY
per spec: it is recorded and reported, but never itself blocks or passes a
candidate. All thresholds come from Settings, not constants here, so an
operator can retune the gate without touching this code.
"""
from __future__ import annotations

from app.config import Settings


def run_falsification_gate(
    spatial_overlap: float, centroid_distance_km: float, arrival_time_error_h: float,
    drift_replay_ran_successfully: bool, physically_plausible: bool,
    behavioural_score: float, settings: Settings,
) -> dict:
    reasons: list[str] = []

    spatial_test = spatial_overlap >= settings.falsification_min_spatial_overlap
    if not spatial_test:
        reasons.append("SPATIAL_MISMATCH")

    temporal_test = arrival_time_error_h <= settings.falsification_max_arrival_error_h
    if not temporal_test:
        reasons.append("TEMPORAL_MISMATCH")

    drift_test = drift_replay_ran_successfully and centroid_distance_km <= settings.falsification_max_centroid_km
    if not drift_test:
        reasons.append("DRIFT_MISMATCH")

    physical_test = physically_plausible
    if not physical_test:
        reasons.append("PHYSICAL_INCONSISTENCY")

    pass_fail = spatial_test and temporal_test and drift_test and physical_test

    return {
        "spatial_test": spatial_test,
        "temporal_test": temporal_test,
        "drift_test": drift_test,
        "physical_test": physical_test,
        "behavioural_signal": round(behavioural_score, 4),
        "reasons": reasons,
        "pass_fail": pass_fail,
    }
