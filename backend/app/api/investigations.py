"""
Investigations API (spec section 21: GET /api/investigations/{id},
GET /api/investigations/{id}/events; spec section 14 for the progress
contract). POST here submits the full M1-M6 pipeline as a Celery task and
returns immediately with a task id; the two GET endpoints read that task's
REAL state from Celery's result backend (Redis) -- polled here, not
faked. A task that hasn't reached a given percentage yet simply hasn't
reported it, because the backend genuinely hasn't done that work yet.
"""
from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from shapely.geometry import box
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import InsufficientData
from app.core.validation import BBoxValidationMixin
from app.db.repository import get_observation, save_incident, set_observation_incident
from app.db.session import get_session
from app.jobs.celery_app import celery_app
from app.jobs.investigation_pipeline import run_full_investigation

router = APIRouter()


class InvestigationRequest(BBoxValidationMixin):
    incident_id: str
    product_id: str
    polarization: str = "vv"
    observation_time: str
    age_hours_min: float = 6.0
    age_hours_max: float = 30.0


@router.post("")
async def start_investigation(req: InvestigationRequest):
    async_result = run_full_investigation.delay(
        req.incident_id, req.product_id, req.minlon, req.minlat, req.maxlon, req.maxlat,
        req.polarization, req.observation_time, req.age_hours_min, req.age_hours_max,
    )
    return {"task_id": async_result.id, "status": "SUBMITTED"}


class FromObservationRequest(BaseModel):
    observation_id: str
    incident_id: str | None = None
    incident_name: str | None = None
    polarization: str | None = None
    age_hours_min: float = 6.0
    age_hours_max: float = 30.0


@router.post("/from-observation")
async def start_investigation_from_observation(req: FromObservationRequest, session: AsyncSession = Depends(get_session)):
    """Gap-analysis section 8/9's "orchestration layer": the individual
    provider capabilities (Sentinel-1/ERA5/CMEMS/GFW) and the M1-M6
    pipeline already existed; what didn't was a single call that goes
    straight from an ingested SAR product to a running investigation
    without the caller re-supplying product_id/bbox/polarization/
    observation_time by hand. This endpoint reads those from the
    Observation row POST /api/observations/ingest created, then submits
    the exact same Celery task POST /api/investigations does -- no second
    pipeline implementation.
    """
    observation = await get_observation(session, req.observation_id)
    if observation is None:
        raise InsufficientData("No observation with this id.", observation_id=req.observation_id)

    missing = [
        field for field, value in (
            ("product_id", observation["product_id"]),
            ("safe_dir", observation["safe_dir"]),
            ("acquisition_time", observation["acquisition_time"]),
            ("bbox", observation["bbox"]),
        ) if not value
    ]
    if missing:
        raise InsufficientData(
            "Observation is missing fields required to start an investigation "
            "(re-upload, or check /api/observations/{id} for extraction warnings).",
            observation_id=req.observation_id, missing_fields=missing, status=observation["status"],
        )

    incident_id = req.incident_id or observation["incident_id"]
    if not incident_id:
        minlon, minlat, maxlon, maxlat = observation["bbox"]
        name = req.incident_name or f"Investigation - {observation['product_id']}"
        incident = await save_incident(session, name, box(minlon, minlat, maxlon, maxlat))
        incident_id = incident.id
        await session.commit()

    if observation["incident_id"] != incident_id:
        await set_observation_incident(session, req.observation_id, incident_id)
        await session.commit()

    polarization = req.polarization or (observation["polarization"] or "vv").split("/")[0].lower()
    minlon, minlat, maxlon, maxlat = observation["bbox"]

    async_result = run_full_investigation.delay(
        incident_id, observation["product_id"], minlon, minlat, maxlon, maxlat,
        polarization, observation["acquisition_time"], req.age_hours_min, req.age_hours_max,
    )
    return {
        "task_id": async_result.id,
        "status": "SUBMITTED",
        "incident_id": incident_id,
        "observation_id": req.observation_id,
        "product_id": observation["product_id"],
        "bbox": observation["bbox"],
        "polarization": polarization,
    }


def _snapshot(task_id: str) -> dict:
    result = celery_app.AsyncResult(task_id)
    payload = {"task_id": task_id, "state": result.state}
    if result.state == "PROGRESS":
        payload.update(result.info or {})
    elif result.state == "SUCCESS":
        payload["percent"] = 100
        payload["result"] = result.result
    elif result.state == "FAILURE":
        payload["percent"] = None
        payload["error"] = str(result.info)
    return payload


@router.get("/{task_id}")
async def get_investigation(task_id: str):
    return _snapshot(task_id)


@router.get("/{task_id}/events")
async def stream_investigation_events(task_id: str):
    """Server-Sent Events stream. Polls the real Celery result backend
    every 500ms and emits a new `data:` frame only -- there is no
    client-visible timer independent of backend state; if the worker
    hasn't updated state, this endpoint has nothing new to say and simply
    repeats the last known real state."""
    async def event_stream():
        last_percent = None
        while True:
            snapshot = _snapshot(task_id)
            if snapshot.get("percent") != last_percent or snapshot["state"] in ("SUCCESS", "FAILURE"):
                yield f"data: {json.dumps(snapshot)}\n\n"
                last_percent = snapshot.get("percent")
            if snapshot["state"] in ("SUCCESS", "FAILURE"):
                break
            await asyncio.sleep(0.5)

    return StreamingResponse(event_stream(), media_type="text/event-stream")
