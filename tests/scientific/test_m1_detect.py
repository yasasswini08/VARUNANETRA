"""
Scientific validation test for M1 DETECT (spec section 23: "known synthetic
source/release ... should approximately recover known trajectory/geometry").

This builds a synthetic calibrated-DN scene with a single embedded dark
elliptical feature plus multiplicative speckle noise, feeds it through the
*real* calibration -> speckle filter -> CFAR -> vectorize -> characterize
pipeline (run_detection_on_arrays -- everything except SAFE-file I/O), and
checks that the pipeline recovers the ellipse's area and orientation within
a tolerance appropriate for a discretized, noisy detector. This is a fixture
for testing pipeline correctness, not a "demo mode" data source -- it never
runs inside the app itself, only in this test.
"""
from __future__ import annotations

import numpy as np
from affine import Affine

from app.detection.pipeline import run_detection_on_arrays
from app.detection.postprocessing import LookAlikeRules

RNG = np.random.default_rng(seed=7)


def make_synthetic_scene(rows=220, cols=320, enl=4.0):
    """East-west oriented dark ellipse, semi-axes 42 (along columns) x 14
    (along rows) pixels, centred at (row=110, col=170), against open-water
    background, both in linear sigma0 units with sigma_lut=1 so dn == sqrt(sigma0)."""
    bg_sigma0 = 0.020
    spill_sigma0 = 0.0035  # ~7.6 dB darker than background

    rr, cc = np.mgrid[0:rows, 0:cols]
    a, b = 42.0, 14.0
    center_row, center_col = 110.0, 170.0
    inside = (((cc - center_col) / a) ** 2 + ((rr - center_row) / b) ** 2) <= 1.0

    sigma0_true = np.where(inside, spill_sigma0, bg_sigma0)

    # multiplicative speckle: Gamma(shape=enl, scale=1/enl) has mean 1
    speckle = RNG.gamma(shape=enl, scale=1.0 / enl, size=sigma0_true.shape)
    sigma0_noisy = sigma0_true * speckle
    dn = np.sqrt(sigma0_noisy)  # sigma_lut == 1 everywhere -> sigma0 = dn^2

    pixel_deg = 0.0009  # ~100 m pixels, plenty for this test's purposes
    lat0, lon0 = 22.30, 68.50
    transform = Affine(pixel_deg, 0.0, lon0, 0.0, -pixel_deg, lat0)

    # trivial 2x2 calibration grid: sigma_lut == 1 everywhere
    cal_lines = np.array([0, rows - 1])
    cal_pixels = np.array([0, cols - 1])
    cal_sigma = np.ones((2, 2))

    land_mask = np.zeros((rows, cols), dtype=bool)  # open water only, no land in frame

    px_lon_km = pixel_deg * 111.32 * np.cos(np.radians(lat0))
    px_lat_km = pixel_deg * 110.54
    expected_area_km2 = np.pi * (a * px_lon_km) * (b * px_lat_km)

    return dict(
        dn=dn, cal_lines=cal_lines, cal_pixels=cal_pixels, cal_sigma=cal_sigma,
        transform=transform, land_mask=land_mask,
        expected_area_km2=expected_area_km2, expected_orientation_deg=90.0,
    )


def test_recovers_single_dark_ellipse():
    scene = make_synthetic_scene()
    candidates, diagnostics = run_detection_on_arrays(
        scene["dn"], scene["cal_lines"], scene["cal_pixels"], scene["cal_sigma"],
        scene["transform"], scene["land_mask"],
        cfar_guard=18, cfar_window=55,  # must exceed the ellipse's own semi-axes (14 x 42 px),
                                        # else the background ring samples the feature's own
                                        # interior instead of true open water -- see module notes
                                        # on CFAR window sizing vs. target size.
        look_alike_rules=LookAlikeRules(min_distance_to_land_km=0.0),  # no land in this synthetic scene
    )

    accepted = [c for c in candidates if c["rejected_reason"] is None]
    assert len(accepted) == 1, f"expected exactly one accepted candidate, got {len(accepted)}: {candidates}"

    c = accepted[0]
    area_ratio = c["area_km2"] / scene["expected_area_km2"]
    assert 0.6 < area_ratio < 1.4, (
        f"recovered area {c['area_km2']:.3f} km2 too far from expected "
        f"{scene['expected_area_km2']:.3f} km2 (ratio {area_ratio:.2f})"
    )

    orientation_error = min(
        abs(c["orientation_deg"] - scene["expected_orientation_deg"]),
        180 - abs(c["orientation_deg"] - scene["expected_orientation_deg"]),
    )
    assert orientation_error < 15, f"orientation {c['orientation_deg']} deg too far from expected 90 deg"

    assert c["contrast_db"] > 3.0, "recovered feature should be markedly darker than background"
    assert c["elongation"] > 1.5, "this synthetic feature is elongated east-west; elongation should reflect that"
    assert c["classification_label"] == "OIL_SPILL_CANDIDATE"


def test_background_only_scene_yields_no_candidates():
    """A uniform-background scene (speckle only, no embedded feature) should
    not produce a spurious accepted candidate -- guards against a
    miscalibrated CFAR threshold that flags noise as a spill."""
    rows, cols, enl = 150, 200, 4.0
    bg_sigma0 = 0.020
    speckle = RNG.gamma(shape=enl, scale=1.0 / enl, size=(rows, cols))
    dn = np.sqrt(bg_sigma0 * speckle)

    transform = Affine(0.0009, 0.0, 68.5, 0.0, -0.0009, 22.3)
    cal_lines = np.array([0, rows - 1])
    cal_pixels = np.array([0, cols - 1])
    cal_sigma = np.ones((2, 2))
    land_mask = np.zeros((rows, cols), dtype=bool)

    candidates, diagnostics = run_detection_on_arrays(
        dn, cal_lines, cal_pixels, cal_sigma, transform, land_mask,
        look_alike_rules=LookAlikeRules(min_distance_to_land_km=0.0),
    )
    accepted = [c for c in candidates if c["rejected_reason"] is None]
    assert len(accepted) == 0, f"expected no candidates in a pure-background scene, got {accepted}"
