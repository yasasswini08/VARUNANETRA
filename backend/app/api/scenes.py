from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.repository import list_scenes
from app.db.session import get_session
from app.providers.sentinel1 import get_sentinel1_provider
from fastapi import HTTPException
from app.core.validation import validate_time_range

router = APIRouter()


@router.get("")
async def get_persisted_scenes(incident_id: str | None = None, limit: int = 100, session: AsyncSession = Depends(get_session)):
    """Lists scenes already persisted via POST /api/detection/run -- distinct
    from GET /search below, which queries the live CDSE catalogue and never
    touches the database."""
    return {"scenes": await list_scenes(session, incident_id=incident_id, limit=limit)}


@router.get("/search")
async def search_scenes(
    minlon: float = Query(...), minlat: float = Query(...),
    maxlon: float = Query(...), maxlat: float = Query(...),
    start: str = Query(..., description="ISO8601, e.g. 2026-03-10T00:00:00Z"),
    end: str = Query(..., description="ISO8601"),
    max_results: int = Query(20, le=100),
):
    if not -180 <= minlon <= 180:
        raise HTTPException(status_code=422, detail="minlon must be between -180 and 180")

    if not -180 <= maxlon <= 180:
        raise HTTPException(status_code=422, detail="maxlon must be between -180 and 180")

    if not -90 <= minlat <= 90:
        raise HTTPException(status_code=422, detail="minlat must be between -90 and 90")

    if not -90 <= maxlat <= 90:
        raise HTTPException(status_code=422, detail="maxlat must be between -90 and 90")

    if minlon >= maxlon:
        raise HTTPException(status_code=422, detail="minlon must be less than maxlon")

    if minlat >= maxlat:
        raise HTTPException(status_code=422, detail="minlat must be less than maxlat")

    if start > end:
        raise HTTPException(status_code=422, detail="start must be earlier than or equal to end")

    """Real Sentinel-1 GRD search against CDSE. Raises 424
    PROVIDER_NOT_CONFIGURED (not fake results) if CDSE_CLIENT_ID/SECRET are
    absent, and 502 PROVIDER_UNAVAILABLE if CDSE itself errors."""
    provider = get_sentinel1_provider()
    scenes = await provider.search_scenes((minlon, minlat, maxlon, maxlat), start, end, max_results)
    return {"count": len(scenes), "scenes": scenes}


@router.get("/{product_id}")
async def get_scene(product_id: str):
    provider = get_sentinel1_provider()
    return await provider.get_scene(product_id)
