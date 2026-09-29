"""
Postprocessing: binary dark-spot mask -> vetted candidate polygons.

Look-alike filtering (spec section 7, step 9) is deliberately conservative
and rule-based rather than a black box: each rule is named, and a rejected
candidate keeps its rejection reason rather than silently disappearing, so
an analyst reviewing a null result can see what was screened out and why.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from affine import Affine
from scipy import ndimage as ndi
from shapely.geometry import shape
from shapely.ops import unary_union
from rasterio.features import shapes as rio_shapes


@dataclass
class RawCandidate:
    polygon: object            # shapely geometry, pixel coordinates
    pixel_count: int
    rejected_reason: str | None = None


def extract_components(mask: np.ndarray, transform: Affine, min_pixels: int = 25) -> list[RawCandidate]:
    """Labels connected regions in the dark-spot mask and vectorizes each to
    a polygon in the CRS `transform` maps into (lon/lat, for the approximate
    GCP-based transform this pipeline uses -- see calibration.py). Components
    smaller than `min_pixels` are dropped before vectorization -- at typical
    IW GRD ground sampling (~10 m), 25 pixels is roughly 0.0025 km2, near the
    noise floor of what a CFAR detector can support statistically anyway."""
    labeled, n = ndi.label(mask, structure=np.ones((3, 3)))
    if n == 0:
        return []

    counts = ndi.sum(mask, labeled, index=np.arange(1, n + 1))
    keep_labels = {i + 1 for i, c in enumerate(counts) if c >= min_pixels}
    if not keep_labels:
        return []

    filtered = np.where(np.isin(labeled, list(keep_labels)), labeled, 0)

    candidates: list[RawCandidate] = []
    for geom, value in rio_shapes(filtered.astype(np.int32), mask=filtered > 0, connectivity=8, transform=transform):
        label_id = int(value)
        pixel_count = int(counts[label_id - 1])
        candidates.append(RawCandidate(polygon=shape(geom), pixel_count=pixel_count))
    return candidates


@dataclass
class LookAlikeRules:
    min_area_km2: float = 0.01
    max_area_km2: float = 500.0
    min_elongation: float = 1.3          # length/width; near-circular blobs are more often look-alikes
    max_distance_to_land_km: float | None = None  # None = no upper bound
    min_distance_to_land_km: float = 0.15         # exclude harbour/breakwater shadow right at the coast


def apply_look_alike_rules(metrics: dict, rules: LookAlikeRules) -> str | None:
    """Returns None if the candidate passes every rule, else the name of the
    first rule it failed."""
    if metrics["area_km2"] < rules.min_area_km2:
        return "AREA_BELOW_MINIMUM"
    if metrics["area_km2"] > rules.max_area_km2:
        return "AREA_ABOVE_MAXIMUM_LIKELY_ATMOSPHERIC_OR_WIND_SHADOW"
    if metrics["elongation"] < rules.min_elongation:
        return "INSUFFICIENT_ELONGATION_LIKELY_LOOK_ALIKE"
    if metrics["distance_to_land_km"] < rules.min_distance_to_land_km:
        return "TOO_CLOSE_TO_COAST_LIKELY_SHADOW_OR_HARBOUR_CALM"
    if rules.max_distance_to_land_km is not None and metrics["distance_to_land_km"] > rules.max_distance_to_land_km:
        return "TOO_FAR_OFFSHORE_FOR_CONFIGURED_AOI"
    return None
