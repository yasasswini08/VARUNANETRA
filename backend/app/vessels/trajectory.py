"""
Turns a raw, irregularly-timestamped list of AIS points (as returned by
AISProvider.get_tracks) into an hourly-indexed track: interpolated
position at each whole hour before the observation time, plus the vessel's
instantaneous speed at each of those hours. Everything downstream in
attribution/scoring.py only consumes this regular hourly structure, not
raw AIS points directly, so a different AIS provider with a different
native point cadence doesn't require any change past this module.
"""
from __future__ import annotations

import datetime as dt

import numpy as np


class VesselTrack:
    def __init__(self, points: list[dict]):
        pts = sorted(
            (p for p in points if p.get("timestamp") and p.get("lat") is not None and p.get("lon") is not None),
            key=lambda p: p["timestamp"],
        )
        if not pts:
            raise ValueError("VesselTrack requires at least one valid timestamped point")
        self.points = pts
        self.mmsi = pts[0].get("mmsi")
        self.imo = pts[0].get("imo")
        self.name = pts[0].get("name")
        self.vessel_type = pts[0].get("vessel_type")
        self._times = np.array([self._parse_ts(p["timestamp"]).replace(tzinfo=None) for p in pts], dtype="datetime64[s]")
        self._lons = np.array([p["lon"] for p in pts], dtype=float)
        self._lats = np.array([p["lat"] for p in pts], dtype=float)

    @staticmethod
    def _parse_ts(ts) -> dt.datetime:
        if isinstance(ts, dt.datetime):
            return ts
        return dt.datetime.fromisoformat(str(ts).replace("Z", "+00:00"))

    def position_at(self, target_time: dt.datetime) -> tuple[float, float] | None:
        """Linearly interpolates lon/lat at target_time. Returns None if
        target_time falls outside the track's observed span (no
        extrapolation -- an unobserved position is not a known position)."""
        t = np.datetime64(target_time.replace(tzinfo=None), "s")
        if t < self._times[0] or t > self._times[-1]:
            return None
        idx = np.searchsorted(self._times, t)
        if idx == 0:
            return float(self._lons[0]), float(self._lats[0])
        t0, t1 = self._times[idx - 1], self._times[idx]
        span = (t1 - t0).astype("timedelta64[s]").astype(float)
        f = 0.0 if span == 0 else (t - t0).astype("timedelta64[s]").astype(float) / span
        lon = self._lons[idx - 1] + f * (self._lons[idx] - self._lons[idx - 1])
        lat = self._lats[idx - 1] + f * (self._lats[idx] - self._lats[idx - 1])
        return float(lon), float(lat)

    def speed_at(self, target_time: dt.datetime, window_hours: float = 1.0) -> float | None:
        """Approximate speed (knots) from positions window_hours apart,
        centred on target_time, using geodesic distance -- used in
        preference to any provider-reported instantaneous speed field,
        since not all providers populate that reliably."""
        from pyproj import Geod
        geod = Geod(ellps="WGS84")
        p0 = self.position_at(target_time - dt.timedelta(hours=window_hours / 2))
        p1 = self.position_at(target_time + dt.timedelta(hours=window_hours / 2))
        if p0 is None or p1 is None:
            return None
        _, _, dist_m = geod.inv(p0[0], p0[1], p1[0], p1[1])
        return (dist_m / 1852.0) / window_hours  # metres -> nautical miles, over the window -> knots

    def max_gap_hours(self, start: dt.datetime, end: dt.datetime) -> float:
        """Largest silent gap (no AIS points) within [start, end] --
        AIS-off behaviour indicative of intentional avoidance, or just poor
        coverage; scoring.py treats this as supporting, not conclusive,
        evidence either way."""
        mask = (self._times >= np.datetime64(start.replace(tzinfo=None), "s")) & \
               (self._times <= np.datetime64(end.replace(tzinfo=None), "s"))
        ts = self._times[mask]
        if ts.size < 2:
            return (end - start).total_seconds() / 3600.0
        gaps = np.diff(ts).astype("timedelta64[s]").astype(float) / 3600.0
        return float(gaps.max()) if gaps.size else 0.0


def group_tracks_by_vessel(points: list[dict]) -> dict[str, VesselTrack]:
    by_vessel: dict[str, list[dict]] = {}
    for p in points:
        key = p.get("mmsi") or p.get("imo") or p.get("name")
        if not key:
            continue
        by_vessel.setdefault(key, []).append(p)
    return {k: VesselTrack(v) for k, v in by_vessel.items() if v}
