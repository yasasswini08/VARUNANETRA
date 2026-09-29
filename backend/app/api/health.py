from fastapi import APIRouter

from app.config import get_settings
from app.providers.cmems import get_cmems_provider
from app.providers.era5 import get_era5_provider
from app.providers.sentinel1 import get_sentinel1_provider

router = APIRouter()


@router.get("/health")
async def health():
    settings = get_settings()
    return {"status": "ok", "app_mode": settings.app_mode.value, "model_version": settings.model_version}


@router.get("/providers/status")
async def providers_status():
    """Reports, per provider, whether real credentials are present. Nothing
    here fabricates a 'connected' state -- this is the endpoint the frontend
    calls before offering the analyst a REAL-mode investigation, and the exact
    endpoint the acceptance test (spec section 31) checks when a step fails
    for lack of credentials."""
    settings = get_settings()
    return {
        "app_mode": settings.app_mode.value,
        "providers": [
            get_sentinel1_provider().status(),
            get_era5_provider().status(),
            get_cmems_provider().status(),
            {"name": "ais_global_fishing_watch", "configured": bool(settings.gfw_api_token),
             "required_credentials": ["GFW_API_TOKEN"]},
        ],
    }
