"""
Slick characterization (spec section 7, "Calculate:").

Area/perimeter use `pyproj.Geod.geometry_area_perimeter`, which computes
true geodesic area on the WGS84 ellipsoid directly from lon/lat coordinates
-- no local projection choice to get wrong, and correct at any latitude,
which matters because a naive equirectangular area formula drifts fast away
from the equator.

Orientation, length and width come from a minimum-rotated-bounding-rectangle
fit (shapely's `oriented_envelope`), which is the standard practical stand-in
for a principal-axis fit on an irregular slick outline: the long axis of
that rectangle approximates the drift/spreading direction, and its two side
lengths approximate along-axis length and cross-axis width.
"""
from __future__ import annotations

import numpy as np
from pyproj import Geod
from shapely.geometry.base import BaseGeometry
from shapely import oriented_envelope

_GEOD = Geod(ellps="WGS84")


def geodesic_area_km2(polygon: BaseGeometry) -> float:
    area_m2, _ = _GEOD.geometry_area_perimeter(polygon)
    return abs(area_m2) / 1e6


def geodesic_perimeter_km(polygon: BaseGeometry) -> float:
    _, perimeter_m = _GEOD.geometry_area_perimeter(polygon)
    return abs(perimeter_m) / 1e3


def _edge_length_km(p0: tuple[float, float], p1: tuple[float, float]) -> float:
    _, _, dist_m = _GEOD.inv(p0[0], p0[1], p1[0], p1[1])
    return dist_m / 1e3


def orientation_length_width(polygon: BaseGeometry) -> tuple[float, float, float]:
    """Returns (orientation_deg, length_km, width_km). orientation_deg is
    measured clockwise from north (0-180, axis has no inherent direction)."""
    rect = oriented_envelope(polygon)
    coords = list(rect.exterior.coords)[:-1]  # 4 corners, closed ring dropped
    if len(coords) != 4:
        # degenerate (near-linear) geometry; fall back to bounding-box diagonal
        minx, miny, maxx, maxy = polygon.bounds
        return 0.0, _edge_length_km((minx, miny), (maxx, miny)), _edge_length_km((minx, miny), (minx, maxy))

    edge01 = _edge_length_km(coords[0], coords[1])
    edge12 = _edge_length_km(coords[1], coords[2])
    if edge01 >= edge12:
        length_km, width_km = edge01, edge12
        dx, dy = coords[1][0] - coords[0][0], coords[1][1] - coords[0][1]
    else:
        length_km, width_km = edge12, edge01
        dx, dy = coords[2][0] - coords[1][0], coords[2][1] - coords[1][1]

    bearing_deg = (np.degrees(np.arctan2(dx, dy))) % 180.0
    return bearing_deg, length_km, max(width_km, 1e-6)


def characterize(
    polygon: BaseGeometry, sigma0_db_inside: np.ndarray, sigma0_db_background: np.ndarray,
    distance_to_land_km: float,
) -> dict:
    area_km2 = geodesic_area_km2(polygon)
    perimeter_km = geodesic_perimeter_km(polygon)
    orientation_deg, length_km, width_km = orientation_length_width(polygon)
    elongation = length_km / width_km if width_km > 0 else 1.0
    compactness = (4 * np.pi * area_km2) / (perimeter_km ** 2) if perimeter_km > 0 else 0.0  # 1.0 = perfect circle

    inside_valid = sigma0_db_inside[np.isfinite(sigma0_db_inside)]
    bg_valid = sigma0_db_background[np.isfinite(sigma0_db_background)]

    inside_mean = float(np.mean(inside_valid)) if inside_valid.size else None
    bg_mean = float(np.mean(bg_valid)) if bg_valid.size else None
    bg_std = float(np.std(bg_valid)) if bg_valid.size else None

    contrast_db = (
        bg_mean - inside_mean
        if inside_mean is not None and bg_mean is not None
        else None
    )

    # Detection score in [0, 1]: combines radiometric contrast (in units of
    # local background sigma, capped) with shape plausibility (elongated
    # slicks score higher than near-circular ones, which are more often
    # look-alikes -- see postprocessing.LookAlikeRules).
    contrast_z = (
        0.0
        if contrast_db is None or bg_std is None or bg_std <= 0
        else max(0.0, contrast_db) / bg_std
    )
    contrast_term = min(1.0, contrast_z / 4.0)
    shape_term = min(1.0, max(0.0, (elongation - 1.0) / 4.0))
    detection_score = round(0.7 * contrast_term + 0.3 * shape_term, 4)

    return {
        "area_km2": round(area_km2, 4),
        "perimeter_km": round(perimeter_km, 4),
        "centroid": (polygon.centroid.x, polygon.centroid.y),
        "orientation_deg": round(orientation_deg, 2),
        "length_km": round(length_km, 4),
        "width_km": round(width_km, 4),
        "elongation": round(elongation, 3),
        "compactness": round(compactness, 4),
        "contrast_db": round(contrast_db, 2) if contrast_db is not None else None,
        "distance_to_land_km": round(distance_to_land_km, 3),
        "detection_score": detection_score,
    }
