"""
M1 DETECT — deterministic baseline segmentation.

Per the build order ("initial deterministic baseline first" before a
learned model), this implements a two-parameter CFAR (Constant False Alarm
Rate) dark-spot detector, the standard first-pass method in the SAR
oil-spill literature: for each pixel, compare its calibrated backscatter to
the mean and standard deviation of a surrounding annulus of "background"
pixels (excluding a guard band immediately around the test pixel, so the
dark spot itself doesn't pollute its own background estimate). A pixel is
flagged dark if it falls more than `k` background standard deviations below
the local background mean.

This runs on the dB image (not linear sigma0) because background clutter
in SAR sea-surface backscatter is close to log-normal, making a dB-domain
threshold far more stable across different wind/sea-state conditions than a
fixed linear-power cutoff would be.

A trained segmentation model (ml/models/, PyTorch U-Net/DeepLabV3+) can
replace or ensemble with this function without changing anything downstream
-- postprocessing.py and slick_characterization.py only consume the binary
mask this returns, not how it was produced. No trained model ships with
this repository: training one needs a labeled SAR oil-spill dataset (e.g.
the ESA/CleanSeaNet-style archives) this sandbox has neither the network
access nor the GPU to obtain or train against. `ml/models/README.md`
documents exactly what `segmentation.py` expects from a checkpoint so this
slot can be filled in later without touching the pipeline around it.

KNOWN LIMITATION -- fixed window size vs. target size: `guard` and `window`
must be set larger than the feature you're trying to detect, or the
background ring falls entirely inside the feature itself and it becomes
invisible to its own local statistics (verified directly by
tests/scientific/test_m1_detect.py, which fails without correctly-sized
parameters). Real oil slicks range from under a km2 to 100+ km2 along axis
lengths of tens of km, which no single fixed window serves well. An
operational deployment should run this at 2-3 window scales and take the
union of detections, or replace it with a superpixel/multiscale approach --
tracked as a follow-up, not implemented here.
"""
from __future__ import annotations

import numpy as np
from scipy.ndimage import generic_filter, uniform_filter


def _annulus_kernel(inner: int, outer: int) -> np.ndarray:
    size = 2 * outer + 1
    yy, xx = np.mgrid[-outer:outer + 1, -outer:outer + 1]
    r = np.sqrt(xx * xx + yy * yy)
    return ((r > inner) & (r <= outer)).astype(np.float32)


def cfar_dark_spots(
    sigma0_db: np.ndarray, valid_mask: np.ndarray,
    guard: int = 3, window: int = 12, k: float = 2.8,
) -> np.ndarray:
    """
    valid_mask: True where the pixel is usable (sea surface, not land, not
    nodata) -- land and nodata pixels are excluded from both the background
    statistics and the output.
    guard: half-width of the excluded inner region around the test pixel.
    window: half-width of the outer background annulus.
    k: number of standard deviations below the local mean to flag as dark.
       2.8 is a moderately conservative starting point (fewer false
       positives, some faint slicks missed) -- tune with real labeled scenes.
    """
    img = np.where(valid_mask, sigma0_db, np.nan)

    kernel = _annulus_kernel(guard, window)
    ksum = kernel.sum()

    def _mean(block):
        vals = block[kernel.ravel() > 0]
        vals = vals[~np.isnan(vals)]
        return vals.mean() if vals.size > ksum * 0.3 else np.nan

    def _std(block):
        vals = block[kernel.ravel() > 0]
        vals = vals[~np.isnan(vals)]
        return vals.std() if vals.size > ksum * 0.3 else np.nan

    # generic_filter with a full annulus is expensive at full scene
    # resolution; this is fine for an AOI-sized subwindow (hundreds to a
    # couple thousand pixels per side), which is what /api/detection/run
    # operates on. A full-swath production run should block-tile this.
    size = 2 * window + 1
    local_mean = generic_filter(img, _mean, size=size, mode="nearest")
    local_std = generic_filter(img, _std, size=size, mode="nearest")

    threshold = local_mean - k * local_std
    dark = (img < threshold) & valid_mask & ~np.isnan(local_mean)
    return dark


def cfar_dark_spots_fast(
    sigma0_db: np.ndarray, valid_mask: np.ndarray,
    guard: int = 3, window: int = 12, k: float = 2.8,
) -> np.ndarray:
    """Separable-kernel approximation of `cfar_dark_spots` using two
    uniform_filter passes (background = large-window average minus
    inner-window average, variance via the same trick on squared values).
    Roughly two orders of magnitude faster than the exact annulus version
    above and close enough for operational use; the exact version stays
    available for validation against it on a small AOI."""
    img = np.where(valid_mask, sigma0_db, 0.0)
    mask_f = valid_mask.astype(np.float32)

    inner, outer = 2 * guard + 1, 2 * window + 1
    sum_out, cnt_out = uniform_filter(img * mask_f, size=outer) * outer**2, uniform_filter(mask_f, size=outer) * outer**2
    sum_in, cnt_in = uniform_filter(img * mask_f, size=inner) * inner**2, uniform_filter(mask_f, size=inner) * inner**2
    sq_out = uniform_filter((img * img) * mask_f, size=outer) * outer**2
    sq_in = uniform_filter((img * img) * mask_f, size=inner) * inner**2

    ring_cnt = np.clip(cnt_out - cnt_in, 1, None)
    ring_sum = sum_out - sum_in
    ring_sq = sq_out - sq_in
    local_mean = ring_sum / ring_cnt
    local_var = np.clip(ring_sq / ring_cnt - local_mean**2, 0, None)
    local_std = np.sqrt(local_var)

    threshold = local_mean - k * local_std
    enough_background = ring_cnt > (outer**2 - inner**2) * 0.3
    dark = (img < threshold) & valid_mask & enough_background

    # uniform_filter pads with reflected data at the array edges; within one
    # outer-window's width of the border that reflection can itself look
    # like a false "dark anomaly" rather than real background contrast, so
    # that margin is excluded rather than trusted.
    border = window
    if border > 0:
        dark[:border, :] = False
        dark[-border:, :] = False
        dark[:, :border] = False
        dark[:, -border:] = False

    return dark
