"""
Real database integration test: runs only if DATABASE_URL points at a live,
migrated Postgres+PostGIS instance (set VARUNA_TEST_DATABASE_URL to opt in
explicitly, so the rest of the suite never silently depends on a database
being available). This is not mocked -- it opens a real asyncpg/psycopg
connection, inserts a real Incident and SpillDetection with real Shapely
geometries, and reads them back, checking the round-tripped geometry
matches the original to within floating-point tolerance.

Developed and verified against a real local PostgreSQL 16 + PostGIS 3.4
instance installed via apt in the development sandbox (see PHASE_STATUS.md
for exact commands) -- not against a mock, and not merely against SQLite.
"""
from __future__ import annotations

import os

import pytest
from shapely.geometry import Polygon

pytestmark = pytest.mark.skipif(
    not os.environ.get("VARUNA_TEST_DATABASE_URL"),
    reason="Set VARUNA_TEST_DATABASE_URL to a real, migrated Postgres+PostGIS instance to run this test.",
)


@pytest.fixture
async def session():
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    engine = create_async_engine(os.environ["VARUNA_TEST_DATABASE_URL"])
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as s:
        yield s
        await s.rollback()  # never leave test rows behind in a shared dev database
    await engine.dispose()


@pytest.mark.asyncio
async def test_incident_and_spill_detection_round_trip(session):
    from app.db.repository import save_incident, save_satellite_scene, save_spill_detection, get_incident_with_detections
    import datetime as dt

    bbox = Polygon([(68.0, 21.0), (70.0, 21.0), (70.0, 23.0), (68.0, 23.0), (68.0, 21.0)])
    incident = await save_incident(session, "Test incident — Gulf of Kutch", bbox)
    assert incident.id is not None

    scene_geom = Polygon([(68.0, 21.5), (69.5, 21.5), (69.5, 22.8), (68.0, 22.8), (68.0, 21.5)])
    scene = await save_satellite_scene(
        session, incident.id, "sentinel1_cdse", "S1A_TEST_ROUNDTRIP",
        dt.datetime(2026, 3, 12, 6, 0), scene_geom, "VV", "https://example.invalid/scene", {},
    )
    assert scene.id is not None

    slick_poly = Polygon([(68.55, 22.05), (68.60, 22.05), (68.60, 22.09), (68.55, 22.09), (68.55, 22.05)])
    candidate = {
        "geometry": slick_poly.__geo_interface__, "area_km2": 12.4, "orientation_deg": 45.0,
        "length_km": 5.0, "width_km": 2.5, "compactness": 0.6, "detection_score": 0.82,
        "classification_label": "OIL_SPILL_CANDIDATE", "model_version": "m1-cfar-baseline-0.1.0",
    }
    detection = await save_spill_detection(session, incident.id, scene.id, candidate)
    assert detection.id is not None
    assert abs(detection.area_km2 - 12.4) < 1e-9

    await session.flush()
    fetched = await get_incident_with_detections(session, incident.id)
    assert fetched is not None
    assert fetched["incident"]["name"] == "Test incident — Gulf of Kutch"
    assert len(fetched["detections"]) == 1

    roundtripped_geom = fetched["detections"][0]["geometry"]
    from shapely.geometry import shape as shapely_shape
    roundtripped = shapely_shape(roundtripped_geom)
    assert roundtripped.equals_exact(slick_poly, tolerance=1e-6), (
        f"round-tripped geometry does not match original: {roundtripped.wkt} vs {slick_poly.wkt}"
    )


@pytest.mark.asyncio
async def test_full_candidate_chain_round_trip(session):
    """Persists a real M5 pipeline outcome (true-source-vs-decoy, same
    scenario validated scientifically in test_m5_pasha.py) all the way
    through Vessel -> Candidate -> PashaRun -> FalsificationResult, then
    reads the falsification row back and checks its pass_fail/reasons
    match what the in-memory pipeline computed -- proving the DB layer
    doesn't silently corrupt or drop the falsification gate's verdict."""
    from shapely.geometry import Point
    from sqlalchemy import select

    from app.db import models
    from app.db.repository import (
        save_candidate, save_falsification_result, save_incident, save_pasha_run, upsert_vessel,
    )
    from tests.scientific.test_m5_pasha import make_decoy_vessel_track, make_true_vessel_track, _run_pipeline_to_candidates

    tracks = {"TRUE1": make_true_vessel_track(), "DECOY1": make_decoy_vessel_track()}
    candidates, settings, observed_slick = _run_pipeline_to_candidates(tracks)
    by_key = {c["vessel_key"]: c for c in candidates}

    incident = await save_incident(session, "M5 chain round-trip test", observed_slick.buffer(0.5))

    saved_pasha_ids = {}
    for key, c in by_key.items():
        vessel = await upsert_vessel(session, mmsi=key, imo=None, name=c.get("name"), vessel_type=c.get("vessel_type"))
        candidate_row = await save_candidate(session, incident.id, vessel.mmsi, c)
        release_point = Point(c["best_fit_position"]["lon"], c["best_fit_position"]["lat"])
        import datetime as dt
        pasha_row = await save_pasha_run(
            session, candidate_row.id, release_point, dt.datetime(2026, 3, 12, 6, 0),
            {"ensemble_size": 250}, None,
            spatial_overlap=c["falsification"].get("spatial_signal", 0.0) or 0.0,
            centroid_distance_km=0.0, temporal_error_h=0.0,
            consistency_score=c["falsification"]["physical_consistency_score"],
        )
        falsification_row = await save_falsification_result(session, pasha_row.id, c["falsification"])
        saved_pasha_ids[key] = (pasha_row.id, falsification_row.id)

    await session.flush()

    for key, (pasha_id, falsification_id) in saved_pasha_ids.items():
        result = await session.execute(
            select(models.FalsificationResult).where(models.FalsificationResult.id == falsification_id)
        )
        row = result.scalar_one()
        assert row.pass_fail == by_key[key]["falsification"]["pass_fail"], (
            f"{key}: DB pass_fail {row.pass_fail} != in-memory {by_key[key]['falsification']['pass_fail']}"
        )
        assert row.reasons == by_key[key]["falsification"]["reasons"]

    assert by_key["TRUE1"]["falsification"]["pass_fail"] is True
    assert by_key["DECOY1"]["falsification"]["pass_fail"] is False


@pytest.mark.asyncio
async def test_origin_analysis_round_trip(session):
    from shapely.geometry import Polygon
    import datetime as dt
    from app.db.repository import save_incident, save_origin_analysis

    bbox = Polygon([(68.0, 21.0), (70.0, 21.0), (70.0, 23.0), (68.0, 23.0), (68.0, 21.0)])
    incident = await save_incident(session, "Origin analysis round-trip test", bbox)

    origin_region = Polygon([(68.5, 22.0), (68.6, 22.0), (68.6, 22.1), (68.5, 22.1), (68.5, 22.0)])
    release_start = dt.datetime(2026, 3, 11, 12, 0)
    release_end = dt.datetime(2026, 3, 12, 0, 0)

    row = await save_origin_analysis(
        session, incident.id, origin_region, release_start, release_end,
        uncertainty_km=4.7, ensemble_size=400, model_version="varuna-netra-m2-opendrift-0.1.0",
    )
    await session.flush()

    from sqlalchemy import select
    from app.db import models
    result = await session.execute(select(models.OriginAnalysis).where(models.OriginAnalysis.id == row.id))
    fetched = result.scalar_one()
    assert abs(fetched.uncertainty_km - 4.7) < 1e-9
    assert fetched.ensemble_size == 400
    assert fetched.release_start == release_start

    from geoalchemy2.shape import to_shape
    fetched_geom = to_shape(fetched.probable_origin_geometry)
    assert fetched_geom.geom_type == "MultiPolygon"
    assert fetched_geom.geoms[0].equals_exact(origin_region, tolerance=1e-6)
