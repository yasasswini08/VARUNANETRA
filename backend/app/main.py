from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import detection, drift, environment, health, incidents, investigations, observations, pasha, reports, scenes, vessels
from app.config import get_settings
from app.core.exceptions import VarunaError
from app.core.logging import configure_logging, get_logger

settings = get_settings()
configure_logging(settings.environment)
log = get_logger(__name__)

app = FastAPI(
    title="Varuna Netra",
    description="Physics-constrained satellite oil-spill source attribution platform",
    version=settings.model_version,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in production
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(VarunaError)
async def varuna_error_handler(request: Request, exc: VarunaError):
    status_map = {
        "PROVIDER_NOT_CONFIGURED": 424,
        "PROVIDER_UNAVAILABLE": 502,
        "MODE_INTEGRITY_VIOLATION": 500,
        "INVALID_GEOMETRY": 400,
        "SIMULATION_FAILURE": 500,
        "INSUFFICIENT_DATA": 404,
        "INGESTION_FAILED": 422,
    }
    code = status_map.get(exc.reason_code, 500)
    log.warning("varuna_error", reason_code=exc.reason_code, message=exc.message, **exc.context)
    return JSONResponse(
        status_code=code,
        content={"reason_code": exc.reason_code, "message": exc.message, "context": exc.context},
    )


app.include_router(health.router, prefix="/api", tags=["health"])
app.include_router(scenes.router, prefix="/api/scenes", tags=["scenes"])
app.include_router(environment.router, prefix="/api/environment", tags=["environment"])
app.include_router(detection.router, prefix="/api/detection", tags=["detection"])
app.include_router(drift.router, prefix="/api/drift", tags=["drift"])
app.include_router(vessels.router, prefix="/api/vessels", tags=["vessels"])
app.include_router(pasha.router, prefix="/api/pasha", tags=["pasha"])
app.include_router(reports.router, prefix="/api/reports", tags=["reports"])
app.include_router(incidents.router, prefix="/api/incidents", tags=["incidents"])
app.include_router(observations.router, prefix="/api/observations", tags=["observations"])
app.include_router(investigations.router, prefix="/api/investigations", tags=["investigations"])
