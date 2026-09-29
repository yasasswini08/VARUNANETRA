"""
Behavioural indicators (spec section 10/12: "supporting, not mandatory,
evidence"). Two signals, both individually weak and only meaningful in
combination with the spatial/temporal/trajectory tests in scoring.py:

  - slow_steaming: unusually low speed near the hypothesised release hour,
    consistent with a vessel that has throttled back (deliberately or
    otherwise) during a discharge.
  - ais_gap: a period of missing AIS around the hypothesised release --
    consistent with, but nowhere near proof of, intentional avoidance.
"""
from __future__ import annotations

import datetime as dt

from app.vessels.trajectory import VesselTrack


def slow_steaming_signal(track: VesselTrack, hypothesis_time: dt.datetime, low_knots: float = 5.0, moderate_knots: float = 8.0) -> float:
    speed = track.speed_at(hypothesis_time, window_hours=2.0)
    if speed is None:
        return 0.0
    if speed < low_knots:
        return 1.0
    if speed < moderate_knots:
        return 0.5
    return 0.0


def ais_gap_signal(track: VesselTrack, hypothesis_time: dt.datetime, half_window_hours: float = 6.0, gap_threshold_hours: float = 2.0) -> float:
    start = hypothesis_time - dt.timedelta(hours=half_window_hours)
    end = hypothesis_time + dt.timedelta(hours=half_window_hours)
    gap = track.max_gap_hours(start, end)
    if gap >= gap_threshold_hours * 3:
        return 1.0
    if gap >= gap_threshold_hours:
        return 0.5
    return 0.0


def behavioural_score(track: VesselTrack, hypothesis_time: dt.datetime) -> float:
    return min(1.0, 0.55 * slow_steaming_signal(track, hypothesis_time) + 0.45 * ais_gap_signal(track, hypothesis_time))
