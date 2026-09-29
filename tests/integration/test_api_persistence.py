"""
Exercises the real FastAPI route -> repository -> PostGIS write path over
HTTP (via TestClient), not just the repository functions in isolation.
Sentinel-1 provider auth and the SAR pipeline itself are already verified
elsewhere (test_provenance_integrity.py's 424 check; test_m1_detect.py's
scientific validation) -- this test's job is specifically to prove the
*endpoint wiring* commits real rows, so it stubs those two pieces with
clearly-labelled test doubles (not application fallbacks: they exist only
inside this test function, monkeypatched via pytest's fixture, never
reachable from a real request) while leaving the DB session real.
"""
from __future__ import annotations

import os
import uuid

import pytest

pytestmark = pytest.mark.skipif(
    not os.environ.get("VARUNA_TEST_DATABASE_URL"),
    reason="Set VARUNA_TEST_DATABASE_URL to a real, migrated Postgres+PostGIS instance to run this test.",
)


@pytest.fixture
def client(monkeypatch):
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.db.session import get_session
    from app.main import app

    engine = create_async_engine(os.environ["VARUNA_TEST_DATABASE_URL"])
    TestSession = async_sessionmaker(engine, expire_on_commit=False)

    async def override_get_session():
        async with TestSession() as s:
            yield s

    app.dependency_overrides[get_session] = override_get_session

    from fastapi.testclient import TestClient
    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()


def test_incident_then_detection_run_persists_real_rows(client, monkeypatch, tmp_path):
    from shapely.geometry import box

    # --- create a real incident ---
    r = client.post("/api/incidents", json=dict(name="HTTP wiring test", minlon=68.0, minlat=21.0, maxlon=70.0, maxlat=23.0))
    assert r.status_code == 200, r.text
    incident_id = r.json()["id"]
    assert incident_id

    r = client.get(f"/api/incidents/{incident_id}")
    assert r.status_code == 200, r.text
    assert r.json()["incident"]["name"] == "HTTP wiring test"
    assert r.json()["detections"] == []

    # --- stub Sentinel-1 auth + SAR pipeline (test doubles, see module docstring) ---
    import app.api.detection as detection_module

    class FakeProvider:
        def is_configured(self):
            return True

        async def download_scene(self, product_id, dest_path):
            raise AssertionError("download_scene should not be called once the archive already exists")

    monkeypatch.setattr(detection_module, "get_sentinel1_provider", lambda: FakeProvider())

    product_id = f"TEST_PRODUCT_{uuid.uuid4().hex[:8]}"
    safe_root = tmp_path / "varuna-netra" / product_id
    safe_root.mkdir(parents=True, exist_ok=True)
    (safe_root / f"{product_id}.zip").write_bytes(b"not a real zip, just needs to exist")
    monkeypatch.setattr(detection_module.tempfile, "gettempdir", lambda: str(tmp_path))

    fake_candidate = {
        "geometry": box(68.55, 22.05, 68.60, 22.09).__geo_interface__,
        "area_km2": 9.3, "orientation_deg": 30.0, "length_km": 4.0, "width_km": 1.5,
        "compactness": 0.55, "detection_score": 0.77,
        "classification_label": "OIL_SPILL_CANDIDATE", "model_version": "m1-cfar-baseline-0.1.0",
        "rejected_reason": None,
    }
    monkeypatch.setattr(
        detection_module, "run_detection_from_safe",
        lambda *a, **k: ([fake_candidate], {"cfar_params": {"guard": 18, "window": 55, "k": 2.8}}),
    )

    # --- run detection against the real incident ---
    r = client.post("/api/detection/run", json=dict(
        incident_id=incident_id, product_id=product_id,
        minlon=68.5, minlat=22.0, maxlon=68.7, maxlat=22.2,
    ))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["incident_id"] == incident_id
    assert len(body["persisted_detection_ids"]) == 1

    # --- confirm it is REALLY in the database, via a fresh HTTP GET ---
    r = client.get(f"/api/incidents/{incident_id}")
    assert r.status_code == 200, r.text
    detections = r.json()["detections"]
    assert len(detections) == 1
    assert abs(detections[0]["area_km2"] - 9.3) < 1e-9
    assert detections[0]["classification_label"] == "OIL_SPILL_CANDIDATE"
