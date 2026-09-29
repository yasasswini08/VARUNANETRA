"""
A minimal equirectangular SVG map for the evidence dossier -- observed
slick, probable origin region, and candidate vessel positions coloured by
their final status. Deliberately not matplotlib: this is a handful of
polygons and points, and a raw SVG string keeps the report generator's
dependency footprint to exactly Jinja2 + WeasyPrint (both already in the
spec's reporting stack) rather than adding a plotting library whose only
job here would be drawing five shapes.
"""
from __future__ import annotations

from shapely.geometry.base import BaseGeometry

_STATUS_COLOR = {
    "LEADING": "#d97706", "SECONDARY": "#2563eb", "AMBIGUOUS": "#6b7280", "REJECTED": "#dc2626",
}


def _project(lon: float, lat: float, bbox, width: int, height: int, pad: int = 30) -> tuple[float, float]:
    minx, miny, maxx, maxy = bbox
    x = pad + (lon - minx) / (maxx - minx or 1) * (width - 2 * pad)
    y = height - pad - (lat - miny) / (maxy - miny or 1) * (height - 2 * pad)
    return x, y


def _polygon_path(geom: BaseGeometry, bbox, width: int, height: int) -> str:
    parts = []
    polys = [geom] if geom.geom_type == "Polygon" else list(geom.geoms)
    for poly in polys:
        coords = list(poly.exterior.coords)
        pts = [_project(x, y, bbox, width, height) for x, y in coords]
        d = "M " + " L ".join(f"{x:.1f},{y:.1f}" for x, y in pts) + " Z"
        parts.append(d)
    return " ".join(parts)


def render_investigation_map_svg(
    observed_slick: BaseGeometry, origin_region: BaseGeometry | None,
    candidates: list[dict], width: int = 720, height: int = 480,
) -> str:
    all_geoms = [observed_slick] + ([origin_region] if origin_region else [])
    minx = min(g.bounds[0] for g in all_geoms)
    miny = min(g.bounds[1] for g in all_geoms)
    maxx = max(g.bounds[2] for g in all_geoms)
    maxy = max(g.bounds[3] for g in all_geoms)
    for c in candidates:
        pos = c.get("best_fit_position")
        if pos:
            minx, maxx = min(minx, pos["lon"]), max(maxx, pos["lon"])
            miny, maxy = min(miny, pos["lat"]), max(maxy, pos["lat"])
    pad_deg = 0.1 * max(maxx - minx, maxy - miny, 0.01)
    bbox = (minx - pad_deg, miny - pad_deg, maxx + pad_deg, maxy + pad_deg)

    svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
           f'viewBox="0 0 {width} {height}" style="background:#0b1e2c;font-family:sans-serif">']

    if origin_region is not None:
        svg.append(f'<path d="{_polygon_path(origin_region, bbox, width, height)}" '
                    f'fill="#45c2d8" fill-opacity="0.25" stroke="#45c2d8" stroke-width="1.2"/>')
    svg.append(f'<path d="{_polygon_path(observed_slick, bbox, width, height)}" '
                f'fill="#f0a93b" fill-opacity="0.5" stroke="#f0a93b" stroke-width="1.5"/>')

    for c in candidates:
        pos = c.get("best_fit_position")
        if not pos:
            continue
        x, y = _project(pos["lon"], pos["lat"], bbox, width, height)
        color = _STATUS_COLOR.get(c.get("status", "AMBIGUOUS"), "#9ca3af")
        svg.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="5" fill="{color}" stroke="#e7eff0" stroke-width="1"/>')
        label = c.get("name") or c.get("vessel_key", "")
        svg.append(f'<text x="{x + 8:.1f}" y="{y + 4:.1f}" font-size="11" fill="#e7eff0">{label}</text>')

    svg.append(
        '<g font-size="11" fill="#e7eff0">'
        '<rect x="12" y="12" width="14" height="10" fill="#f0a93b" fill-opacity="0.6"/>'
        '<text x="30" y="21">Observed slick</text>'
        '<rect x="12" y="30" width="14" height="10" fill="#45c2d8" fill-opacity="0.4"/>'
        '<text x="30" y="39">Probable origin (50% HDR)</text>'
        "</g>"
    )
    svg.append("</svg>")
    return "".join(svg)
