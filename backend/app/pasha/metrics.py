"""
Spec section 11, verbatim: "Do not call this probability of guilt. Call it:
PHYSICAL CONSISTENCY SCORE." This module produces exactly that and nothing
resembling the forbidden framing -- no field, log message, or docstring
anywhere in this codebase should describe it otherwise.
"""
from __future__ import annotations


def physical_consistency_score(
    spatial_overlap: float, centroid_distance_km: float, arrival_time_error_h: float, shape_similarity: float,
    centroid_scale_km: float = 15.0, arrival_scale_h: float = 6.0,
) -> float:
    centroid_term = 1.0 / (1.0 + centroid_distance_km / centroid_scale_km)
    arrival_term = 1.0 / (1.0 + arrival_time_error_h / arrival_scale_h)
    score = 0.45 * spatial_overlap + 0.25 * centroid_term + 0.15 * arrival_term + 0.15 * shape_similarity
    return round(float(max(0.0, min(1.0, score))), 4)
