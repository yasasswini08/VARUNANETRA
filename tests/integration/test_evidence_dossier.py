"""
End-to-end check that the M6 evidence dossier actually renders — a real
Jinja2 template into real HTML, and a real WeasyPrint PDF with a plausible
byte size — fed with output from the same true-source-vs-decoy pipeline
validated in test_m5_pasha.py. Also confirms the five spec-mandated
disclaimers (section 28) appear verbatim, and that the H0 branch of section
13 renders correctly when the outcome is H0_UNKNOWN_SOURCE.
"""
from __future__ import annotations

import datetime as dt
import os
import tempfile

from app.reports.evidence_dossier import build_evidence_dossier_html, build_evidence_dossier_pdf
from tests.scientific.test_m5_pasha import (
    OBSERVATION_TIME, make_decoy_vessel_track, make_true_vessel_track, _run_pipeline_to_candidates,
)
from app.attribution.decision_gate import decide

REQUIRED_DISCLAIMERS = [
    "Attribution status is an analytical assessment, not a legal verdict.",
    "Physical consistency does not establish criminal responsibility.",
    "AIS absence does not prove vessel involvement.",
    "Satellite dark features may have non-oil look-alikes.",
    "Model uncertainty can limit discrimination between closely spaced candidate sources.",
]

MODEL_VERSIONS = {
    "pipeline": "varuna-netra-0.1.0", "m1_detect": "m1-cfar-baseline-0.1.0",
    "m2_reconstruct": "varuna-netra-m2-opendrift-0.1.0",
}
LIMITATIONS = [
    "M1 DETECT uses a deterministic CFAR baseline; no trained segmentation model is included.",
    "Geocoding uses an approximate GCP-based transform without terrain correction.",
    "Release-time window is derived from an externally supplied slick-age estimate, not the backward ensemble's own spread.",
]


def _common_kwargs(observed_slick, origin_analysis, candidates, outcome):
    return dict(
        incident_id="TEST-INCIDENT-001",
        observation_time=OBSERVATION_TIME,
        aoi_bbox=observed_slick.bounds,
        sentinel1_scene={"product_id": "S1A_TEST_PRODUCT", "acquisition_time": OBSERVATION_TIME.isoformat()},
        spill_detection={"area_km2": 12.4, "model_version": "m1-cfar-baseline-0.1.0"},
        origin_analysis=origin_analysis,
        environmental_provenance={
            "wind": {"source": "Copernicus Climate Data Store", "dataset": "reanalysis-era5-single-levels",
                     "time_start": "2026-03-11T12:00:00Z", "time_end": "2026-03-12T20:00:00Z"},
            "current": {"source": "Copernicus Marine Service", "dataset": "cmems_mod_glo_phy_anfc_merged-uv_PT1H-i",
                        "time_start": "2026-03-11T12:00:00Z", "time_end": "2026-03-12T20:00:00Z"},
        },
        candidates=candidates,
        outcome=outcome,
        model_versions=MODEL_VERSIONS,
        limitations=LIMITATIONS,
        observed_slick_geometry=observed_slick,
    )


def test_dossier_html_contains_all_disclaimers_and_leading_status():
    tracks = {"TRUE1": make_true_vessel_track(), "DECOY1": make_decoy_vessel_track()}
    candidates, settings, observed_slick = _run_pipeline_to_candidates(tracks)
    outcome = decide(candidates, settings)
    origin_analysis = {
        "probable_origin_centroid": {"lon": 68.55, "lat": 22.05},
        "uncertainty_km": 3.2, "ensemble_size": 400,
        "release_start": (OBSERVATION_TIME - dt.timedelta(hours=30)).isoformat(),
        "release_end": (OBSERVATION_TIME - dt.timedelta(hours=6)).isoformat(),
    }

    html = build_evidence_dossier_html(**_common_kwargs(observed_slick, origin_analysis, candidates, outcome))

    for disclaimer in REQUIRED_DISCLAIMERS:
        assert disclaimer in html, f"missing required disclaimer: {disclaimer}"
    assert "LEADING" in html
    assert "TRUE1" in html or "MT True Source" in html
    assert "REJECTED" in html  # decoy should show up as rejected somewhere in the tables


def test_dossier_pdf_actually_renders_and_h0_branch_shows_correctly():
    tracks = {"DECOY1": make_decoy_vessel_track("DECOY1"), "DECOY2": make_decoy_vessel_track("DECOY2")}
    candidates, settings, observed_slick = _run_pipeline_to_candidates(tracks)
    outcome = decide(candidates, settings)
    assert outcome["status"] == "H0_UNKNOWN_SOURCE"

    origin_analysis = {
        "probable_origin_centroid": {"lon": 68.55, "lat": 22.05},
        "uncertainty_km": 5.1, "ensemble_size": 400,
        "release_start": (OBSERVATION_TIME - dt.timedelta(hours=30)).isoformat(),
        "release_end": (OBSERVATION_TIME - dt.timedelta(hours=6)).isoformat(),
    }

    html = build_evidence_dossier_html(**_common_kwargs(observed_slick, origin_analysis, candidates, outcome))
    assert "H0_UNKNOWN_SOURCE" in html
    assert "This investigation returned H0" in html
    for disclaimer in REQUIRED_DISCLAIMERS:
        assert disclaimer in html

    with tempfile.TemporaryDirectory() as tmp:
        pdf_path = os.path.join(tmp, "dossier.pdf")
        build_evidence_dossier_pdf(**_common_kwargs(observed_slick, origin_analysis, candidates, outcome), output_path=pdf_path)
        assert os.path.exists(pdf_path)
        size = os.path.getsize(pdf_path)
        assert size > 8_000, f"PDF suspiciously small ({size} bytes) -- likely near-empty render"
        with open(pdf_path, "rb") as f:
            assert f.read(5) == b"%PDF-", "output is not a valid PDF file"
