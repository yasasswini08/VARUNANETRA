"""
Direct environmental-data endpoints. Not in the spec's core endpoint list —
these exist so ERA5/CMEMS retrieval can be triggered and inspected on their
own, ahead of M2/M3 wiring them in automatically. Both block on a real
upstream retrieval (CDS's queue in particular can take minutes), so treat
these as debugging endpoints, not production paths — production should go
through jobs/drift_processing.py once Celery wiring lands (spec phase 14).
"""
from fastapi import APIRouter, Query, HTTPException

from app.providers.cmems import get_cmems_provider
from app.providers.era5 import get_era5_provider

router = APIRouter()


@router.get("/wind")
async def get_wind(
    minlon: float = Query(...), minlat: float = Query(...),
    maxlon: float = Query(...), maxlat: float = Query(...),
    start: str = Query(...), end: str = Query(...),
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
    provider = get_era5_provider()
    ds, provenance = await provider.get_wind_field((minlon, minlat, maxlon, maxlat), start, end)
    return {
        "provenance": provenance.model_dump(mode="json"),
        "variables": list(ds.data_vars),
        "shape": {k: list(v.shape) for k, v in ds.data_vars.items()},
        "time_steps": ds.sizes.get("time") or ds.sizes.get("valid_time"),
    }


@router.get("/currents")
async def get_currents(
    minlon: float = Query(...), minlat: float = Query(...),
    maxlon: float = Query(...), maxlat: float = Query(...),
    start: str = Query(...), end: str = Query(...),
):
    provider = get_cmems_provider()
    ds, provenance = await provider.get_current_field((minlon, minlat, maxlon, maxlat), start, end)
    return {
        "provenance": provenance.model_dump(mode="json"),
        "variables": list(ds.data_vars),
        "shape": {k: list(v.shape) for k, v in ds.data_vars.items()},
    }
