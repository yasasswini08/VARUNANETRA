"""
M1 DETECT — pipeline orchestration.

`run_detection_from_safe` is the real, spec-section-7 entry point: it walks
an actual Sentinel-1 GRD .SAFE directory, calibrates a windowed subset of
the requested polarization to sigma0 dB, speckle-filters it, masks land,
runs the CFAR dark-spot detector, vectorizes and characterizes candidates,
and applies the look-alike rules.

`run_detection_on_arrays` is the array-level core with no filesystem/SAFE
dependency at all -- everything above this line in the module is real SAFE
handling; everything from here down is what tests/scientific exercises
directly against synthetic fixtures, since no real .SAFE product is
reachable from this sandbox to test the outer function against.
"""
from __future__ import annotations

import glob
import os
from dataclasses import asdict

import numpy as np
import rasterio
from affine import Affine
from rasterio.transform import rowcol
from rasterio.windows import Window, from_bounds
from scipy import ndimage as ndi

from app.core.exceptions import InvalidGeometry
from app.core.logging import get_logger
from app.detection.annotation import parse_calibration_vectors, parse_geolocation_grid
from app.detection.calibration import build_approx_transform, build_sigma0_lut, calibrate_to_sigma0, sigma0_to_db
from app.detection.landmask import build_land_mask
from app.detection.postprocessing import LookAlikeRules, apply_look_alike_rules, extract_components
from app.detection.segmentation import cfar_dark_spots_fast
from app.detection.slick_characterization import characterize
from app.detection.speckle import lee_filter

log = get_logger(__name__)


def discover_safe_paths(safe_dir: str, polarization: str = "vv") -> dict:
    pol = polarization.lower()
    measurement = glob.glob(os.path.join(safe_dir, "measurement", f"*-{pol}-*.tiff"))
    calibration = glob.glob(os.path.join(safe_dir, "annotation", "calibration", f"calibration-*-{pol}-*.xml"))
    annotation = glob.glob(os.path.join(safe_dir, "annotation", f"*-{pol}-*.xml"))
    if not measurement or not calibration or not annotation:
        raise InvalidGeometry(
            f"Could not locate {polarization.upper()} measurement/calibration/annotation "
            f"files under {safe_dir} -- is this a genuine unpacked GRD .SAFE product?",
            safe_dir=safe_dir, polarization=polarization,
        )
    return {"measurement": measurement[0], "calibration": calibration[0], "annotation": annotation[0]}


def _pixel_window_for_bbox(transform: Affine, bbox: tuple[float, float, float, float],
                            img_shape: tuple[int, int], margin_px: int = 60) -> Window:
    minlon, minlat, maxlon, maxlat = bbox
    inv = ~transform
    corners = [inv * (minlon, minlat), inv * (minlon, maxlat), inv * (maxlon, minlat), inv * (maxlon, maxlat)]
    cols = [c[0] for c in corners]
    rows = [c[1] for c in corners]
    rows_dim, cols_dim = img_shape
    row0 = max(0, int(min(rows)) - margin_px)
    row1 = min(rows_dim, int(max(rows)) + margin_px)
    col0 = max(0, int(min(cols)) - margin_px)
    col1 = min(cols_dim, int(max(cols)) + margin_px)
    if row1 <= row0 or col1 <= col0:
        raise InvalidGeometry("Requested AOI does not intersect this scene.", bbox=bbox)
    return Window(col_off=col0, row_off=row0, width=col1 - col0, height=row1 - row0)


def run_detection_on_arrays(
    dn: np.ndarray, cal_lines: np.ndarray, cal_pixels: np.ndarray, cal_sigma: np.ndarray,
    transform: Affine, land_mask: np.ndarray | None = None,
    lee_window: int = 7, cfar_guard: int = 3, cfar_window: int = 12, cfar_k: float = 2.8,
    look_alike_rules: LookAlikeRules | None = None, min_pixels: int = 25,
) -> tuple[list[dict], dict]:
    """Array-level core of M1 DETECT. Returns (candidates, diagnostics).
    `land_mask` is optional here (True = land) purely so scientific tests
    can inject a known synthetic mask; `run_detection_from_safe` always
    supplies a real one from landmask.build_land_mask."""
    rules = look_alike_rules or LookAlikeRules()

    sigma_lut = build_sigma0_lut(cal_lines, cal_pixels, cal_sigma, dn.shape)
    sigma0_linear = calibrate_to_sigma0(dn, sigma_lut)
    filtered_linear = lee_filter(sigma0_linear, window=lee_window)
    sigma0_db = sigma0_to_db(filtered_linear)

    if land_mask is None:
        land_mask = np.zeros(dn.shape, dtype=bool)
    valid_mask = ~land_mask & np.isfinite(sigma0_db)

    dark = cfar_dark_spots_fast(sigma0_db, valid_mask, guard=cfar_guard, window=cfar_window, k=cfar_k)
    dark_component_labels, dark_component_count = ndi.label(
        dark,
        structure=np.ones((3, 3))
    )

    dark_component_sizes = ndi.sum(
        dark,
        dark_component_labels,
        index=np.arange(1, dark_component_count + 1)
    )

    print(
        "cfar_component_stats "
        f"total={dark_component_count} "
        f">=25={int(np.sum(dark_component_sizes >= 25))} "
        f"max_pixels={int(np.max(dark_component_sizes)) if dark_component_sizes.size else 0} "
        f"median_pixels={float(np.median(dark_component_sizes)) if dark_component_sizes.size else 0.0:.1f}"
    )
    raw_candidates = extract_components(dark, transform, min_pixels=min_pixels)

    # nearest-land distance, computed once against the land mask actually
    # used for this scene rather than per-candidate
    land_rows, land_cols = np.nonzero(land_mask)
    have_land_in_window = land_rows.size > 0

    candidates: list[dict] = []
    for rc in raw_candidates:
        poly = rc.polygon
        cx, cy = poly.centroid.x, poly.centroid.y
        row, col = rowcol(transform, cx, cy)

        if have_land_in_window:
            d = np.hypot(land_rows - row, land_cols - col)
            nearest_px = float(d.min())
            # approx: pixel pitch in km from the transform's column vector at this latitude
            px_km = abs(transform.a) * 111.32 * np.cos(np.radians(cy))
            distance_to_land_km = nearest_px * px_km
        else:
            distance_to_land_km = 999.0  # sentinel: no land inside the processed window

        # inside/background sigma0 samples for contrast scoring
        row0, row1 = max(0, int(row) - 2), min(sigma0_db.shape[0], int(row) + 3)
        col0, col1 = max(0, int(col) - 2), min(sigma0_db.shape[1], int(col) + 3)
        inside_vals = sigma0_db[row0:row1, col0:col1].ravel()
        bg_row0, bg_row1 = max(0, int(row) - 25), min(sigma0_db.shape[0], int(row) + 26)
        bg_col0, bg_col1 = max(0, int(col) - 25), min(sigma0_db.shape[1], int(col) + 26)
        bg_vals = sigma0_db[bg_row0:bg_row1, bg_col0:bg_col1].ravel()

        metrics = characterize(poly, inside_vals, bg_vals, distance_to_land_km)
        rejected = apply_look_alike_rules(metrics, rules)

        candidates.append({
            "geometry": poly.__geo_interface__,
            "pixel_count": rc.pixel_count,
            **metrics,
            "classification_label": "OIL_SPILL_CANDIDATE" if rejected is None else "REJECTED_LOOK_ALIKE",
            "rejected_reason": rejected,
        })

    diagnostics = {
        "dark_pixel_fraction": float(dark.sum()) / float(valid_mask.sum()) if valid_mask.sum() else 0.0,
        "raw_component_count": len(raw_candidates),
        "accepted_count": sum(1 for c in candidates if c["rejected_reason"] is None),
        "cfar_params": {"guard": cfar_guard, "window": cfar_window, "k": cfar_k},
    }
    return candidates, diagnostics


def run_detection_from_safe(
    safe_dir: str, bbox: tuple[float, float, float, float], polarization: str = "vv", **kwargs,
) -> tuple[list[dict], dict]:
    paths = discover_safe_paths(safe_dir, polarization)
    cal_lines, cal_pixels, cal_sigma = parse_calibration_vectors(paths["calibration"])
    gcp_grid = parse_geolocation_grid(paths["annotation"])
    transform = build_approx_transform(gcp_grid)

    with rasterio.open(paths["measurement"]) as src:
        window = _pixel_window_for_bbox(transform, bbox, (src.height, src.width))
        dn = src.read(1, window=window).astype(np.float32)

        # The Sentinel-1 TIFF does not provide a usable geographic raster
        # transform. Use the GCP-derived full-scene lon/lat transform and
        # shift it into the cropped-window coordinate system.
        window_geo_transform = transform * Affine.translation(
            window.col_off,
            window.row_off,
        )

        # calibration LUT was built against full-scene (line, pixel); shift
        # the coordinate arrays by the window offset so the LUT interpolant
        # still evaluates at the correct full-scene line/pixel for this crop.
        cal_lines_shifted = cal_lines - window.row_off
        cal_pixels_shifted = cal_pixels - window.col_off

    rows_grid, cols_grid = np.meshgrid(
    np.arange(dn.shape[0], dtype=np.float32),
    np.arange(dn.shape[1], dtype=np.float32),
    indexing="ij",
    )

    # Convert cropped-window coordinates back to full-scene pixel coordinates.
    full_rows = rows_grid + window.row_off
    full_cols = cols_grid + window.col_off

    # Convert Sentinel-1 full-scene pixels to geographic lon/lat
    # using the GCP-derived approximate geocoding transform.
    lon_grid, lat_grid = transform * (full_cols, full_rows)

    land_mask = build_land_mask(lat_grid, lon_grid)

    candidates, diagnostics = run_detection_on_arrays(
        dn,
        cal_lines_shifted,
        cal_pixels_shifted,
        cal_sigma,
        window_geo_transform,
        land_mask,
        **kwargs,
    )
    log.info("m1_detect_complete", safe_dir=safe_dir, bbox=bbox, **diagnostics)
    return candidates, diagnostics
