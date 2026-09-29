"""
Radiometric calibration and approximate geocoding for Sentinel-1 GRD.

Calibration: sigma0_linear = DN^2 / sigmaNought_LUT^2, where sigmaNought_LUT
is bilinearly interpolated from the sparse calibration grid to the full
pixel/line resolution of the measurement raster. This is the standard GRD
calibration formula (ESA's own SNAP toolbox uses the same DN^2/LUT^2 form;
some products use DN directly rather than DN^2 for certain instruments/modes
-- verify against the product's specific annotation before trusting this on
a mode this wasn't tested against).

Geocoding: Sentinel-1 GRD is delivered in ground-range, not map-projected --
a real orthorectification needs a DEM (range-Doppler terrain correction).
This module builds an *approximate* affine transform from the annotation's
geolocation GCPs via GDAL's polynomial GCP fit (rasterio.transform.from_gcps),
which ignores terrain height. Over open water -- which is where this
pipeline operates -- terrain relief is zero, so the approximation is close
to exact; it should not be trusted for a scene with coastal cliffs or
mountainous islands in frame without a real DEM-based terrain correction.
"""
from __future__ import annotations

import numpy as np
from affine import Affine
from rasterio.control import GroundControlPoint
from rasterio.transform import from_gcps
from scipy.interpolate import RegularGridInterpolator


def build_sigma0_lut(
    cal_lines: np.ndarray, cal_pixels: np.ndarray, cal_sigma: np.ndarray,
    out_shape: tuple[int, int],
) -> np.ndarray:
    """Interpolates the sparse (n_cal_lines x n_cal_pixels) calibration LUT
    up to a full-resolution (rows, cols) array via bilinear interpolation."""
    rows, cols = out_shape
    interp = RegularGridInterpolator(
        (cal_lines, cal_pixels), cal_sigma, method="linear", bounds_error=False, fill_value=None,
    )
    line_grid, pixel_grid = np.meshgrid(
        np.arange(rows, dtype=np.float32), np.arange(cols, dtype=np.float32), indexing="ij",
    )
    pts = np.stack([line_grid.ravel(), pixel_grid.ravel()], axis=-1)
    lut = interp(pts).reshape(rows, cols)
    return lut


def calibrate_to_sigma0(dn: np.ndarray, sigma_lut: np.ndarray) -> np.ndarray:
    """DN -> sigma0 (linear power). `dn` is the raw measurement band, already
    read as float; `sigma_lut` matches its shape exactly (see build_sigma0_lut)."""
    with np.errstate(divide="ignore", invalid="ignore"):
        sigma0 = (dn.astype(np.float32) ** 2) / (sigma_lut ** 2)
    return sigma0


def sigma0_to_db(sigma0_linear: np.ndarray) -> np.ndarray:
    with np.errstate(divide="ignore", invalid="ignore"):
        return 10.0 * np.log10(np.clip(sigma0_linear, 1e-10, None))


def build_approx_transform(gcp_grid: np.ndarray) -> Affine:
    """gcp_grid: (N, 4) array of [line, pixel, lat, lon] from
    annotation.parse_geolocation_grid. Returns a first-order affine fit --
    adequate for open-water AOIs (see module docstring)."""
    gcps = [
        GroundControlPoint(row=line, col=pixel, x=lon, y=lat)
        for line, pixel, lat, lon in gcp_grid
    ]
    return from_gcps(gcps)
