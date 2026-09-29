"""
CMEMS ocean current provider — Copernicus Marine Service.

Uses the official `copernicusmarine` python toolbox's `subset()` function,
which is the documented, supported way to pull a NetCDF subset of a Marine
Data Store product (superseded the old motu/opendap client in 2023-24). It
is synchronous, so it runs inside `asyncio.to_thread` for the same reason as
the ERA5 client.

Dataset default: cmems_mod_glo_phy_anfc_merged-uv_PT1H-i (global analysis-
and-forecast, merged surface currents, hourly instantaneous). This is the
right general-purpose choice for an oil-drift model anywhere in open ocean;
for a specific coastal/gulf incident a regional nested product (e.g. an IBI
or Arabian Sea product) usually resolves tidal/coastal currents far better,
which is exactly why CMEMS_DATASET_ID is a settings field and not a
constant — override it per incident region rather than editing this file.
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
from app.providers.base import CurrentProvider

log = get_logger(__name__)

VARIABLES = ["uo", "vo"]  # eastward / northward sea water velocity


class CopernicusMarineProvider(CurrentProvider):
    name = "cmems"
    required_credentials = ("CMEMS_USERNAME", "CMEMS_PASSWORD")

    def __init__(self, settings: Settings):
        self.settings = settings

    def is_configured(self) -> bool:
        return bool(self.settings.cmems_username and self.settings.cmems_password)

    def _blocking_subset(
        self, bbox: tuple[float, float, float, float], start: str, end: str, dest: str,
    ) -> None:
        import copernicusmarine

        minlon, minlat, maxlon, maxlat = bbox
        try:
            copernicusmarine.subset(
                dataset_id=self.settings.cmems_dataset_id,
                variables=VARIABLES,
                minimum_longitude=minlon,
                maximum_longitude=maxlon,
                minimum_latitude=minlat,
                maximum_latitude=maxlat,
                start_datetime=start,
                end_datetime=end,
                minimum_depth=0,
                maximum_depth=1,
                output_filename=Path(dest).name,
                output_directory=str(Path(dest).parent),
                username=self.settings.cmems_username,
                password=self.settings.cmems_password,
                overwrite=True,
                disable_progress_bar=True,
            )
        except Exception as exc:  # copernicusmarine raises its own error types on auth/availability failures
            raise ProviderUnavailable(
                "CMEMS subset failed.",
                provider=self.name, dataset=self.settings.cmems_dataset_id, upstream_error=str(exc),
            ) from exc

    async def get_current_field(
        self, bbox: tuple[float, float, float, float], start: str, end: str,
    ):
        import asyncio

        self.require_configured()
        with tempfile.TemporaryDirectory() as tmp:
            dest = str(Path(tmp) / "cmems_currents.nc")
            await asyncio.to_thread(self._blocking_subset, bbox, start, end, dest)
            ds = xr.open_dataset(dest).load()

        provenance = Provenance(
            kind=DataKind.REAL,
            source="Copernicus Marine Service",
            dataset=self.settings.cmems_dataset_id,
            variable="uo, vo",
            time_start=start,
            time_end=end,
            bbox=list(bbox),
            source_url=f"https://data.marine.copernicus.eu/product/{self.settings.cmems_dataset_id}",
            retrieved_at=dt.datetime.now(dt.timezone.utc),
        )
        log.info("cmems_retrieved", bbox=bbox, start=start, end=end, vars=list(ds.data_vars))
        return ds, provenance
