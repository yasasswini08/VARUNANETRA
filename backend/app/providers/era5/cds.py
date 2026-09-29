"""
ERA5 wind provider — Copernicus Climate Data Store (CDS).

Uses the official `cdsapi` client, which as of v0.7+ targets the new CDS
"beta" API (the one described at https://cds.climate.copernicus.eu/api and
configured via CDS_API_URL/CDS_API_KEY, no ~/.cdsapirc file required when a
client is constructed with url= and key= directly, which is what this module
does — nothing here relies on a dotfile existing on disk).

`cdsapi.Client.retrieve()` is synchronous and blocking (it submits the
request, then polls CDS's job queue until the extract is ready and streams
it to disk) — potentially several minutes for a fresh ERA5 pull. It is run
inside `asyncio.to_thread` so it doesn't block the event loop, but a real
call from an API request handler should go through a Celery task
(jobs/drift_processing.py) rather than an HTTP request that itself times out
waiting on CDS's queue.

Dataset requested: reanalysis-era5-single-levels, hourly, 10m u/v wind
components. This is the standard ERA5 product for surface windage in an oil
drift model.
"""
from __future__ import annotations

import datetime as dt
import tempfile
from pathlib import Path

import xarray as xr

from app.config import Settings
from app.core.exceptions import ProviderUnavailable
from app.core.logging import get_logger
from app.core.provenance import DataKind, Provenance
from app.providers.base import WindProvider

log = get_logger(__name__)

DATASET = "reanalysis-era5-single-levels"


class CDSEra5Provider(WindProvider):
    name = "era5_cds"
    required_credentials = ("CDS_API_KEY",)

    def __init__(self, settings: Settings):
        self.settings = settings

    def is_configured(self) -> bool:
        return bool(self.settings.cds_api_key)

    def _build_client(self):
        import cdsapi
        return cdsapi.Client(
            url=self.settings.cds_api_url,
            key=self.settings.cds_api_key,
            quiet=True,
            progress=False,
        )

    def _blocking_retrieve(
        self, bbox: tuple[float, float, float, float], start: str, end: str, dest: str,
    ) -> None:
        client = self._build_client()
        t0 = dt.datetime.fromisoformat(start.replace("Z", "+00:00"))
        t1 = dt.datetime.fromisoformat(end.replace("Z", "+00:00"))
        minlon, minlat, maxlon, maxlat = bbox

        days = sorted({(t0 + dt.timedelta(days=d)).strftime("%d")
                        for d in range((t1 - t0).days + 2)})
        request = {
            "product_type": ["reanalysis"],
            "variable": ["10m_u_component_of_wind", "10m_v_component_of_wind"],
            "year": sorted({str((t0 + dt.timedelta(days=d)).year) for d in range((t1 - t0).days + 2)}),
            "month": sorted({f"{(t0 + dt.timedelta(days=d)).month:02d}" for d in range((t1 - t0).days + 2)}),
            "day": days,
            "time": [f"{h:02d}:00" for h in range(24)],
            # CDS area order is [north, west, south, east]
            "area": [maxlat, minlon, minlat, maxlon],
            "data_format": "netcdf",
        }
        try:
            client.retrieve(DATASET, request).download(dest)
        except Exception as exc:  # cdsapi raises plain Exception subclasses on API errors
            raise ProviderUnavailable(
                "ERA5 retrieval failed.", provider=self.name, upstream_error=str(exc),
            ) from exc

    async def get_wind_field(
        self, bbox: tuple[float, float, float, float], start: str, end: str,
    ):
        import asyncio

        self.require_configured()
        with tempfile.TemporaryDirectory() as tmp:
            dest = str(Path(tmp) / "era5_wind.nc")
            await asyncio.to_thread(self._blocking_retrieve, bbox, start, end, dest)
            ds = xr.open_dataset(dest).load()  # load into memory before tempdir is removed

        provenance = Provenance(
            kind=DataKind.REAL,
            source="Copernicus Climate Data Store",
            dataset=DATASET,
            variable="10m_u_component_of_wind, 10m_v_component_of_wind",
            time_start=start,
            time_end=end,
            bbox=list(bbox),
            source_url="https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels",
            retrieved_at=dt.datetime.now(dt.timezone.utc),
        )
        log.info("era5_retrieved", bbox=bbox, start=start, end=end, vars=list(ds.data_vars))
        return ds, provenance
