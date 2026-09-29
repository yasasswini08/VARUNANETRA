"""
PASHA comparison (spec section 11: "Calculate: A. IoU/spatial overlap,
B. centroid displacement, C. shape similarity, D. arrival-time error").

Spatial overlap is computed as a grid-based IoU (rasterize both the
observed polygon and the simulated ensemble's footprint onto a shared local
grid and intersect), not a bounding-box or convex-hull-only approximation
-- convex hulls in particular would badly overstate overlap for a
crescent-shaped or multi-lobed observed slick.
"""
from __future__ import annotations

import numpy as np
from pyproj import Geod
from shapely.geometry import MultiPoint
from shapely.geometry.base import BaseGeometry

from app.drift.forward import forecast_snapshot
from app.drift.uncertainty import centroid_lonlat
from app.detection.slick_characterization import orientation_length_width

_GEOD = Geod(ellps="WGS84")


def _rasterize_iou(geom_a: BaseGeometry, geom_b: BaseGeometry, grid_n: int = 200) -> float:
    minx = min(geom_a.bounds[0], geom_b.bounds[0])
    miny = min(geom_a.bounds[1], geom_b.bounds[1])
    maxx = max(geom_a.bounds[2], geom_b.bounds[2])
    maxy = max(geom_a.bounds[3], geom_b.bounds[3])
    if maxx <= minx or maxy <= miny:
        return 0.0
    pad = 0.1 * max(maxx - minx, maxy - miny)
    minx, miny, maxx, maxy = minx - pad, miny - pad, maxx + pad, maxy + pad

    xs = np.linspace(minx, maxx, grid_n)
    ys = np.linspace(miny, maxy, grid_n)
    from shapely import contains_xy
    XX, YY = np.meshgrid(xs, ys)
    mask_a = contains_xy(geom_a, XX, YY)
    mask_b = contains_xy(geom_b, XX, YY)
    union = np.count_nonzero(mask_a | mask_b)
    if union == 0:
        return 0.0
    inter = np.count_nonzero(mask_a & mask_b)
    return float(inter) / float(union)


def spatial_overlap(observed_polygon: BaseGeometry, simulated_points: tuple[np.ndarray, np.ndarray]) -> float:
    lons, lats = simulated_points
    if lons.size < 3:
        return 0.0
    simulated_footprint = MultiPoint(list(zip(lons, lats))).convex_hull.buffer(0.001)
    return _rasterize_iou(observed_polygon, simulated_footprint)


def centroid_distance_km(observed_polygon: BaseGeometry, simulated_points: tuple[np.ndarray, np.ndarray]) -> float:
    lons, lats = simulated_points
    sim_c = centroid_lonlat(lons, lats)
    obs_c = (observed_polygon.centroid.x, observed_polygon.centroid.y)
    _, _, dist_m = _GEOD.inv(sim_c[0], sim_c[1], obs_c[0], obs_c[1])
    return float(dist_m) / 1000.0


def shape_similarity(observed_polygon: BaseGeometry, simulated_points: tuple[np.ndarray, np.ndarray]) -> float:
    lons, lats = simulated_points
    if lons.size < 3:
        return 0.0
    sim_hull = MultiPoint(list(zip(lons, lats))).convex_hull
    _, obs_len, obs_wid = orientation_length_width(observed_polygon)
    _, sim_len, sim_wid = orientation_length_width(sim_hull)
    obs_elong = obs_len / obs_wid if obs_wid > 0 else 1.0
    sim_elong = sim_len / sim_wid if sim_wid > 0 else 1.0
    return float(np.clip(1.0 - abs(obs_elong - sim_elong) / max(obs_elong, sim_elong, 1e-6), 0.0, 1.0))


def arrival_time_error_hours(
    result_ds, observed_polygon: BaseGeometry, nominal_hours: float, scan_radius_h: float = 4.0, scan_step_h: float = 0.5,
) -> tuple[float, float]:
    """Scans hours in [nominal - scan_radius, nominal + scan_radius] for the
    one with the best spatial overlap against the observed slick, and
    reports how far that best-overlap hour is from the nominal arrival time
    (`hours_to_observation` from the hypothesis) -- a large offset means the
    simulated patch only matches the observed slick's shape at a time that
    doesn't correspond to when it was actually observed, which is itself
    evidence against the hypothesis even if peak overlap is otherwise high."""
    best_h, best_overlap = nominal_hours, -1.0
    h = max(0.0, nominal_hours - scan_radius_h)
    end = nominal_hours + scan_radius_h
    while h <= end:
        lons, lats = forecast_snapshot(result_ds, hours_ahead=h)
        overlap = spatial_overlap(observed_polygon, (lons, lats))
        if overlap > best_overlap:
            best_overlap = overlap
            best_h = h
        h += scan_step_h
    return abs(best_h - nominal_hours), best_overlap
