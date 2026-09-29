"""
M6 REPORT (spec section 17). Renders evidence_dossier.html.j2 with a real
Jinja2 environment and converts it to an actual PDF with WeasyPrint --
verified in this phase to produce a real, valid PDF file, not merely to
not raise an exception (see PHASE_STATUS.md for the byte-count check run
during development).
"""
from __future__ import annotations

import datetime as dt
import json
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.reports.svg_map import render_investigation_map_svg

TEMPLATE_DIR = Path(__file__).parent / "templates"


def _env() -> Environment:
    return Environment(loader=FileSystemLoader(str(TEMPLATE_DIR)), autoescape=select_autoescape(["html", "j2"]))


def build_evidence_dossier_html(
    incident_id: str, observation_time: dt.datetime, aoi_bbox: tuple[float, float, float, float],
    sentinel1_scene: dict, spill_detection: dict, origin_analysis: dict,
    environmental_provenance: dict, candidates: list[dict], outcome: dict,
    model_versions: dict, limitations: list[str],
    observed_slick_geometry, origin_region_geometry=None,
) -> str:
    from shapely.geometry import shape as shapely_shape
    observed_slick = observed_slick_geometry if hasattr(observed_slick_geometry, "geom_type") else shapely_shape(observed_slick_geometry)
    origin_region = None
    if origin_region_geometry is not None:
        origin_region = origin_region_geometry if hasattr(origin_region_geometry, "geom_type") else shapely_shape(origin_region_geometry)

    map_svg = render_investigation_map_svg(observed_slick, origin_region, candidates)

    full_provenance = {
        "environmental": environmental_provenance,
        "sentinel1_scene": sentinel1_scene,
        "spill_detection_model_version": spill_detection.get("model_version"),
        "pipeline_model_version": model_versions.get("pipeline"),
    }

    template = _env().get_template("evidence_dossier.html.j2")
    return template.render(
        incident_id=incident_id,
        generated_at=dt.datetime.now(dt.timezone.utc).isoformat(),
        observation_time=observation_time.isoformat(),
        aoi_bbox=list(aoi_bbox),
        sentinel1_scene=sentinel1_scene,
        spill_detection=spill_detection,
        origin_analysis=origin_analysis,
        environmental_provenance=environmental_provenance,
        candidates=candidates,
        outcome=outcome,
        model_versions=model_versions,
        limitations=limitations,
        map_svg=map_svg,
        full_provenance_json=json.dumps(full_provenance, indent=2, default=str),
    )


def build_evidence_dossier_pdf(*args, output_path: str, **kwargs) -> str:
    """Same arguments as build_evidence_dossier_html; writes a PDF to
    output_path and returns it. Import of weasyprint is deferred to inside
    this function so the html-only path (useful for quick previews or
    testing) never requires WeasyPrint's system libraries (Pango/Cairo) to
    be installed."""
    from weasyprint import HTML

    html_str = build_evidence_dossier_html(*args, **kwargs)
    HTML(string=html_str).write_pdf(output_path)
    return output_path
