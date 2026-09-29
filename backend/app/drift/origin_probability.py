"""
Origin probability field (spec section 8: "Use kernel density estimation or
particle occupancy to generate an origin probability FIELD. Do not reduce
the result to one point.").

`kde_field` fits a Gaussian KDE to a particle snapshot and evaluates it on a
regular lon/lat grid -- a real density estimate, not a heuristic pixel
blur. `highest_density_region` then extracts the smallest-area contour that
encloses a given fraction of the *total probability mass* (not just the
tallest peak), which is the statistically correct definition of a
credible region for the reconstructed origin.
"""
from __future__ import annotations

import numpy as np
from affine import Affine
from rasterio.features import shapes as rio_shapes
from scipy.stats import gaussian_kde
from shapely.geometry import shape
from shapely.ops import unary_union


def kde_field(
    lons: np.ndarray, lats: np.ndarray, bbox: tuple[float, float, float, float] | None = None,
    grid_n: int = 120, margin_frac: float = 0.15,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Returns (grid_lon_1d, grid_lat_1d, density) where density is
    normalized to sum to 1 over the grid (a discrete probability mass
    function approximating the continuous KDE)."""
    if bbox is None:
        minlon, maxlon = lons.min(), lons.max()
        minlat, maxlat = lats.min(), lats.max()
        mlon = (maxlon - minlon) * margin_frac or 0.01
        mlat = (maxlat - minlat) * margin_frac or 0.01
        bbox = (minlon - mlon, minlat - mlat, maxlon + mlon, maxlat + mlat)
    minlon, minlat, maxlon, maxlat = bbox

    kde = gaussian_kde(np.vstack([lons, lats]))
    grid_lon = np.linspace(minlon, maxlon, grid_n)
    grid_lat = np.linspace(minlat, maxlat, grid_n)
    LON, LAT = np.meshgrid(grid_lon, grid_lat)
    density = kde(np.vstack([LON.ravel(), LAT.ravel()])).reshape(LON.shape)
    density = density / density.sum()
    return grid_lon, grid_lat, density


def highest_density_region(
    grid_lon: np.ndarray, grid_lat: np.ndarray, density: np.ndarray, mass_fraction: float = 0.5,
):
    """Returns a shapely (Multi)Polygon: the smallest-area region whose
    total KDE probability mass equals `mass_fraction` (e.g. 0.5 for a 50%
    credible region). Implemented by sorting grid cells by density
    descending and accepting cells until the cumulative mass is reached,
    which is the standard highest-density-region (HDR) construction."""
    flat = density.ravel()
    order = np.argsort(flat)[::-1]
    cumulative = np.cumsum(flat[order])
    cutoff_idx = np.searchsorted(cumulative, mass_fraction)
    threshold = flat[order[min(cutoff_idx, len(order) - 1)]]

    mask = density >= threshold
    lon0, lat0 = grid_lon[0], grid_lat[0]
    dlon = grid_lon[1] - grid_lon[0]
    dlat = grid_lat[1] - grid_lat[0]
    transform = Affine(dlon, 0, lon0 - dlon / 2, 0, dlat, lat0 - dlat / 2)

    polygons = [
        shape(geom) for geom, value in rio_shapes(mask.astype(np.int32), mask=mask, connectivity=8, transform=transform)
    ]
    if not polygons:
        return None
    return unary_union(polygons)


def release_time_window_from_age_estimate(
    observation_time, age_hours_min: float, age_hours_max: float,
) -> tuple:
    """The probable release-time window is driven by an externally supplied
    slick-age estimate (from M1's characterization, or analyst judgement),
    not derived from the backward ensemble's own spread -- a pure
    Lagrangian backtrack's particle spread grows monotonically the further
    back it is integrated regardless of where the true release was
    (diffusion accumulates with elapsed simulated time in either
    direction), so "minimum spread" is not a valid release-time signal on
    its own. This function just turns an age window into concrete
    timestamps; `origin_probability`/`backward` supply the *spatial* field
    at each hour within that window, and M4/M5 (AIS correlation + PASHA)
    are what actually narrow the window down further using independent
    evidence."""
    import datetime as dt
    release_start = observation_time - dt.timedelta(hours=age_hours_max)
    release_end = observation_time - dt.timedelta(hours=age_hours_min)
    return release_start, release_end
