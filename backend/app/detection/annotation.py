"""
Sentinel-1 GRD annotation parsing.

A real GRD product (a .SAFE directory) carries two XML documents this module
reads directly, using the real element paths from the Sentinel-1 product
format spec (S1-RS-MDA-52-7443):

  annotation/calibration/calibration-*.xml
      <calibration><calibrationVectorList><calibrationVector>
        <line>...</line>
        <pixel>N1 N2 N3 ...</pixel>          (space-separated ints, one grid shared across lines)
        <sigmaNought>v1 v2 v3 ...</sigmaNought>

  annotation/s1?-*.xml (product annotation)
      <geolocationGridPointList><geolocationGridPoint>
        <line>...</line><pixel>...</pixel><latitude>...</latitude><longitude>...</longitude>

Both are sparse grids (typically tens of lines x a few hundred pixel
columns for calibration; a coarser grid again for geolocation) that must be
interpolated to full resolution -- that interpolation is what
`calibration.py` and `preprocessing.py` do with these arrays.
"""
from __future__ import annotations

import numpy as np
from defusedxml import ElementTree as DET


def parse_calibration_vectors(xml_path: str) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Returns (lines, pixel_index, sigma_nought) where sigma_nought has
    shape (n_lines, n_pixels) -- one row per <calibrationVector>, one column
    per shared pixel index. Sentinel-1 calibration vectors share a single
    pixel-index list across all lines in a product, which is what makes a
    dense (lines x pixels) matrix possible without per-row interpolation."""
    tree = DET.parse(xml_path)
    root = tree.getroot()
    lines: list[int] = []
    pixel_ref: list[int] | None = None
    rows: list[list[float]] = []

    for vec in root.iter("calibrationVector"):
        line = int(vec.findtext("line"))
        pixels = [int(p) for p in vec.findtext("pixel").split()]
        sigma = [float(v) for v in vec.findtext("sigmaNought").split()]
        if pixel_ref is None:
            pixel_ref = pixels
        elif pixels != pixel_ref:
            raise ValueError(
                "Calibration vector pixel grid changed between lines -- this "
                "product does not match the assumed shared-grid layout; "
                "per-row interpolation would be needed instead."
            )
        lines.append(line)
        rows.append(sigma)

    if pixel_ref is None:
        raise ValueError(f"No <calibrationVector> elements found in {xml_path}")

    return np.array(lines, dtype=np.int64), np.array(pixel_ref, dtype=np.int64), np.array(rows, dtype=np.float64)


def parse_geolocation_grid(xml_path: str) -> np.ndarray:
    """Returns an (N, 4) array of [line, pixel, latitude, longitude] GCPs
    read from the product annotation XML's geolocation grid."""
    tree = DET.parse(xml_path)
    root = tree.getroot()
    rows = []
    for pt in root.iter("geolocationGridPoint"):
        rows.append((
            float(pt.findtext("line")), float(pt.findtext("pixel")),
            float(pt.findtext("latitude")), float(pt.findtext("longitude")),
        ))
    if not rows:
        raise ValueError(f"No <geolocationGridPoint> elements found in {xml_path}")
    return np.array(rows, dtype=np.float64)
