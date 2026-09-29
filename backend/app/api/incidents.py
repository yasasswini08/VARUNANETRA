"""
Incident API (spec section 21: POST /api/incidents). The one entity every
other pipeline stage's persistence hangs off of (SatelliteScene,
SpillDetection, OriginAnalysis, Candidate, etc. all carry an incident_id
foreign key) -- this had to exist before any endpoint could be rewired from
its process-local dict to real persistence.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from app.core.validation import BBoxValidationMixin
from shapely.geometry import box
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import InsufficientData
from app.db.repository import list_incidents, save_incident
from app.db.session import get_session
from app.core.validation import BBoxValidationMixin

router = APIRouter()


class IncidentCreateRequest(BBoxValidationMixin):
    name: str



@router.post("")
async def create_incident(req: IncidentCreateRequest, session: AsyncSession = Depends(get_session)):
    bbox = box(req.minlon, req.minlat, req.maxlon, req.maxlat)
    incident = await save_incident(session, req.name, bbox)
    await session.commit()
    return {"id": incident.id, "name": incident.name, "status": incident.status}


@router.get("")
async def get_incidents(limit: int = 100, session: AsyncSession = Depends(get_session)):
    return {"incidents": await list_incidents(session, limit=limit)}


@router.get("/{incident_id}")
async def get_incident(incident_id: str, session: AsyncSession = Depends(get_session)):
    from app.db.repository import get_incident_with_detections
    result = await get_incident_with_detections(session, incident_id)
    if result is None:
        raise InsufficientData("No incident with this id.", incident_id=incident_id)
    return result
