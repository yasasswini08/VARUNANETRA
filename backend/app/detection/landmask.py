"""
Land masking.

Uses `global-land-mask` (bundled ~1 km resolution GSHHG-derived coastline
raster, no network call at runtime -- this matters, since this container has
no egress to a coastline tile server anyway). This resolution is coarse
enough that a detection right at a shoreline can be misclassified a pixel or
two either way; for a production deployment on this specific AOI, swapping
in a higher-resolution national coastline vector (e.g. Survey of India's)
and rasterizing it per-scene would tighten this meaningfully. That swap is
exactly why this is a standalone module rather than inlined in the
pipeline -- one function to replace.
"""
from __future__ import annotations

import numpy as np
from global_land_mask import globe


def build_land_mask(lat_grid: np.ndarray, lon_grid: np.ndarray) -> np.ndarray:
    """lat_grid/lon_grid: 2D arrays of the same shape as the SAR raster
    (per-pixel geocoded coordinates). Returns a boolean array, True = land."""
    return globe.is_land(lat_grid, lon_grid)
