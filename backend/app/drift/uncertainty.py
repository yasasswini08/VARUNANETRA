"""
Uncertainty measures for a particle cloud (spec: OriginAnalysis.uncertainty_km).

`characteristic_radius_km` is the RMS geodesic distance from the ensemble's
centroid -- a standard, distribution-agnostic "how spread out is this" scalar
that behaves sensibly whether the cloud is roughly circular or elongated
along the current direction (which real origin distributions usually are).
"""
from __future__ import annotations

import numpy as np
from pyproj import Geod

_GEOD = Geod(ellps="WGS84")


def centroid_lonlat(lons: np.ndarray, lats: np.ndarray) -> tuple[float, float]:
    # simple arithmetic mean is adequate at the sub-degree scales this
    # pipeline operates over; a true spherical centroid isn't needed here.
    return float(np.mean(lons)), float(np.mean(lats))


def characteristic_radius_km(lons: np.ndarray, lats: np.ndarray) -> float:
    clon, clat = centroid_lonlat(lons, lats)
    _, _, dist_m = _GEOD.inv(np.full_like(lons, clon), np.full_like(lats, clat), lons, lats)
    return float(np.sqrt(np.mean(dist_m ** 2)) / 1000.0)
