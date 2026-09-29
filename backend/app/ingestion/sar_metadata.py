"""
SAR metadata extraction (spec gap-analysis section 7/8: "Metadata
extraction"). Reuses `app.detection.annotation.parse_geolocation_grid` --
the same GCP parser M1 DETECT's geocoding already depends on -- so the bbox
reported here is derived the identical way the pipeline will derive its own
working transform, not a second, possibly-inconsistent implementation.

Nothing here calibrates or detects anything; it only reads header/GCP
metadata so an Observation row can be created and (if a full SAFE product
was uploaded) handed straight to the existing M1-M6 pipeline via
POST /api/investigations/from-observation.
"""
from __future__ import annotations

import datetime as dt
import glob
import os
from dataclasses import dataclass, field

from defusedxml import ElementTree as DET

from app.core.exceptions import IngestionError
from app.detection.annotation import parse_geolocation_grid

KNOWN_POLARIZATIONS = ("vv", "vh", "hh", "hv")

SENSOR_NAMES = {"A": "Sentinel-1A", "B": "Sentinel-1B", "C": "Sentinel-1C", "D": "Sentinel-1D"}


@dataclass
class SarMetadata:
    sensor: str | None
    product_id: str
    acquisition_time: dt.datetime | None
    polarizations: list[str] = field(default_factory=list)
    bbox: list[float] | None = None  # [minlon, minlat, maxlon, maxlat]
    product_type: str | None = None
    warnings: list[str] = field(default_factory=list)


def _sensor_and_type_from_product_id(product_id: str) -> tuple[str | None, str | None]:
    tokens = product_id.split("_")
    sensor = None
    product_type = None
    if tokens and len(tokens[0]) >= 3 and tokens[0][:2].upper() == "S1":
        sensor = SENSOR_NAMES.get(tokens[0][2].upper())
    if len(tokens) >= 3:
        product_type = tokens[2]
    return sensor, product_type


def _available_polarizations(safe_dir: str) -> list[str]:
    found = []
    for pol in KNOWN_POLARIZATIONS:
        matches = glob.glob(os.path.join(safe_dir, "annotation", f"*-{pol}-*.xml"))
        if matches:
            found.append(pol.upper())
    return found


def _acquisition_window_from_annotation(xml_path: str) -> tuple[dt.datetime | None, dt.datetime | None]:
    """Reads <adsHeader><startTime>/<stopTime> from a product annotation
    XML. Every Sentinel-1 GRD annotation file carries this header
    regardless of polarization, so any one of the product's annotation
    files is sufficient."""
    tree = DET.parse(xml_path)
    root = tree.getroot()
    header = root.find("adsHeader")
    if header is None:
        return None, None
    start = header.findtext("startTime")
    stop = header.findtext("stopTime")
    start_dt = dt.datetime.fromisoformat(start).replace(tzinfo=dt.timezone.utc) if start else None
    stop_dt = dt.datetime.fromisoformat(stop).replace(tzinfo=dt.timezone.utc) if stop else None
    return start_dt, stop_dt


def extract_sar_metadata(safe_dir: str, product_id: str) -> SarMetadata:
    warnings: list[str] = []
    sensor, product_type = _sensor_and_type_from_product_id(product_id)
    polarizations = _available_polarizations(safe_dir)
    if not polarizations:
        warnings.append("No recognizable polarization annotation files found under annotation/.")

    annotation_files = sorted(glob.glob(os.path.join(safe_dir, "annotation", "*.xml")))
    if not annotation_files:
        raise IngestionError(
            "No annotation XML found -- this does not look like a complete "
            "Sentinel-1 GRD .SAFE product.",
            safe_dir=safe_dir,
        )

    acquisition_time = None
    bbox = None
    for xml_path in annotation_files:
        try:
            start_dt, _stop_dt = _acquisition_window_from_annotation(xml_path)
            if start_dt is not None:
                acquisition_time = start_dt
            gcp_grid = parse_geolocation_grid(xml_path)
            lats = gcp_grid[:, 2]
            lons = gcp_grid[:, 3]
            bbox = [float(lons.min()), float(lats.min()), float(lons.max()), float(lats.max())]
            break  # one annotation file is sufficient; all polarizations share geometry
        except Exception as exc:  # noqa: BLE001 -- try the next annotation file rather than failing outright
            warnings.append(f"Could not parse {os.path.basename(xml_path)}: {exc}")
            continue

    if bbox is None:
        raise IngestionError(
            "Could not derive a bounding box from any annotation file's "
            "geolocation grid.",
            safe_dir=safe_dir,
        )
    if acquisition_time is None:
        warnings.append("No <adsHeader><startTime> found in any annotation file; acquisition_time is unset.")

    return SarMetadata(
        sensor=sensor,
        product_id=product_id,
        acquisition_time=acquisition_time,
        polarizations=polarizations,
        bbox=bbox,
        product_type=product_type,
        warnings=warnings,
    )
