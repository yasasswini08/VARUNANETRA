"""
Proves the SSE endpoint (GET /api/investigations/{id}/events) reflects a
REAL, live Celery worker's REAL, live Redis-backed progress -- not a
client-side timer dressed up as one. Submits the diagnostic
health_check_progress_task directly (the same task scripts/health_check.py
uses), consumes the actual HTTP SSE stream through FastAPI's TestClient,
and asserts multiple distinct percent values arrive with real elapsed time
between them.

Requires a real Celery worker already running against a real Redis broker
(see PHASE_STATUS.md for the exact commands used to start one in this
sandbox) -- skipped by default so the standard suite never depends on
either being present.
"""
from __future__ import annotations

import os
import time

import pytest

pytestmark = pytest.mark.skipif(
    not os.environ.get("VARUNA_TEST_REDIS_URL"),
    reason="Set VARUNA_TEST_REDIS_URL and run a real Celery worker to run this test.",
)


def test_sse_endpoint_reflects_real_worker_progress():
    os.environ.setdefault("REDIS_URL", os.environ["VARUNA_TEST_REDIS_URL"])
    os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://varuna:varuna@localhost:5432/varuna_netra")

    from fastapi.testclient import TestClient
    from app.jobs.investigation_pipeline import health_check_progress_task
    from app.main import app

    async_result = health_check_progress_task.delay(steps=4, delay_s=0.8)

    client = TestClient(app)
    t0 = time.monotonic()
    seen_percents = []
    seen_times = []

    with client.stream("GET", f"/api/investigations/{async_result.id}/events") as response:
        assert response.status_code == 200
        for line in response.iter_lines():
            if not line or not line.startswith("data:"):
                continue
            import json
            payload = json.loads(line[len("data:"):].strip())
            seen_percents.append(payload.get("percent"))
            seen_times.append(time.monotonic() - t0)
            if payload["state"] in ("SUCCESS", "FAILURE"):
                break

    assert seen_percents[-1] == 100, f"stream did not end at 100%: {seen_percents}"
    distinct = [p for p in seen_percents if p is not None]
    assert len(set(distinct)) >= 3, f"expected several distinct real progress values, got {seen_percents}"
    assert distinct == sorted(distinct), f"progress should be monotonically increasing, got {seen_percents}"
    # the whole sequence should have taken a real, non-trivial amount of time
    # (4 steps * 0.8s delay each) -- proves this wasn't all reported instantly
    assert seen_times[-1] > 2.0, f"stream completed suspiciously fast ({seen_times[-1]:.2f}s) for 4x0.8s of real work"
