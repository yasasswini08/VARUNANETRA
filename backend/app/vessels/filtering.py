"""
Coarse filters applied before the more expensive per-hour scoring in
attribution/scoring.py -- spec section 10's funnel: spatial filter,
temporal filter, then trajectory compatibility.
"""
from __future__ import annotations

import datetime as dt

from app.vessels.trajectory import VesselTrack


def temporal_filter(tracks: dict[str, VesselTrack], window_start: dt.datetime, window_end: dt.datetime) -> dict[str, VesselTrack]:
    """Keeps only vessels with at least one AIS point inside the candidate
    release-time window (with a small buffer either side, since a vessel
    present just outside the window can still be relevant to interpolate
    through it)."""
    buffer = dt.timedelta(hours=6)
    kept = {}
    for key, track in tracks.items():
        first, last = track._times[0], track._times[-1]
        lo = (window_start - buffer).replace(tzinfo=None)
        hi = (window_end + buffer).replace(tzinfo=None)
        import numpy as np
        if first <= np.datetime64(hi, "s") and last >= np.datetime64(lo, "s"):
            kept[key] = track
    return kept


def spatial_filter(
    tracks: dict[str, VesselTrack], region_centroid: tuple[float, float],
    max_distance_km: float, at_time_hint: dt.datetime,
) -> dict[str, VesselTrack]:
    """Drops vessels whose closest approach to the region centroid (sampled
    across the vessel's own observed time span) exceeds max_distance_km --
    a cheap reject before the hourly KDE-sampling scoring pass."""
    from pyproj import Geod
    geod = Geod(ellps="WGS84")
    kept = {}
    for key, track in tracks.items():
        best = min(
            geod.inv(lon, lat, region_centroid[0], region_centroid[1])[2] / 1000.0
            for lon, lat in zip(track._lons, track._lats)
        )
        if best <= max_distance_km:
            kept[key] = track
    return kept
