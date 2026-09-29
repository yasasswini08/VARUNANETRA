"""
Speckle filtering.

Implements the (unrefined) Lee filter, the standard adaptive filter for SAR
speckle: it shrinks each pixel toward the local mean by an amount that
depends on the local coefficient of variation, so texture in uniform areas
(open water, a slick) is smoothed hard while genuine edges (coast, ship
wake, slick boundary) are preserved because a high local variance there
suppresses the filter's own strength. This runs on the *linear* sigma0, not
the dB image (speckle is multiplicative in linear power, so this is where
the classical Lee-filter derivation applies).
"""
from __future__ import annotations

import numpy as np
from scipy.ndimage import uniform_filter


def lee_filter(sigma0_linear: np.ndarray, window: int = 7, num_looks: float = 1.0) -> np.ndarray:
    """`num_looks` is the equivalent number of looks (ENL) of the input GRD
    product -- IW GRD is typically multi-looked to ENL ~ 4.4 on the range
    axis and ~1 in azimuth for the standard product, giving an approximate
    ENL a bit under 5; using 1.0 here is conservative (assumes more speckle
    variance than really present, so the filter is not overly aggressive)."""
    img = sigma0_linear.astype(np.float32)
    mean = uniform_filter(img, size=window)
    mean_sq = uniform_filter(img * img, size=window)
    variance = np.clip(mean_sq - mean * mean, 0, None)

    # speckle variance for a Gamma-distributed intensity image at `num_looks`
    cu2 = 1.0 / num_looks
    ci2 = variance / np.clip(mean * mean, 1e-12, None)
    weight = np.clip(1.0 - cu2 / np.clip(ci2, 1e-12, None), 0.0, 1.0)
    weight = np.where(ci2 <= cu2, 0.0, weight)

    return mean + weight * (img - mean)
