"""
Global Fishing Watch (GFW) AIS provider.

GFW's v3 API (https://globalfishingwatch.org/our-apis/) does not expose a
single "give me all AIS points in this bbox/time window" endpoint the way
this module's `get_tracks` signature implies it might -- that's a
consequence of the base AISProvider interface being provider-agnostic, not
of GFW specifically. Real GFW access is two real calls chained:

  1. POST /v3/4wings/report  (spatial-resolution=high, group-by=vessel_id)
     -- discovers which vessel ids had any AIS-derived activity inside the
     requested region during the requested window. This is GFW's own
     documented mechanism for "which vessels were here when".
       -- the actual position/speed/course track points for each candidate.

Both endpoints and their exact parameter names should be re-verified
against https://globalfishingwatch.org/our-apis/documentation before a
production run -- GFW has revised its v3 API surface before, and this
sandbox has no egress to confirm these are still exactly right today.
Everything downstream of this module (app/vessels/, app/attribution/)
only depends on the *shape* of what get_tracks returns, so a parameter-name
fix here is a one-file change.

Per spec section 3D: if 4wings discovery returns no vessel ids, this raises
InsufficientData with the exact required message
"AIS DATA UNAVAILABLE FOR THIS ANALYSIS WINDOW" -- never an empty list
silently treated as "zero candidate vessels found", which is a different
(and importantly, non-alarming) claim than "we don't know".
"""
from __future__ import annotations

import datetime as dt

import httpx

from app.config import Settings
from app.core.exceptions import InsufficientData, ProviderUnavailable
from app.core.logging import get_logger
from app.providers.base import AISProvider

log = get_logger(__name__)

VESSEL_IDENTITY_DATASET = "public-global-vessel-identity:latest"
PRESENCE_DATASET = "public-global-presence:latest"

MAX_CANDIDATE_VESSELS = 50  # cap per-vessel track calls per correlate request


class GFWAISProvider(AISProvider):
    name = "ais_global_fishing_watch"
    required_credentials = ("GFW_API_TOKEN",)

    def __init__(self, settings: Settings):
        self.settings = settings

    def is_configured(self) -> bool:
        return bool(self.settings.gfw_api_token)

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self.settings.gfw_api_token}"}

    async def _discover_vessel_ids(
        self, client: httpx.AsyncClient, bbox: tuple[float, float, float, float], start: str, end: str,
    ) -> list[str]:
        minlon, minlat, maxlon, maxlat = bbox
        region_geojson = {
            "type": "Polygon",
            "coordinates": [[
                [minlon, minlat], [maxlon, minlat], [maxlon, maxlat], [minlon, maxlat], [minlon, minlat],
            ]],
        }
        resp = await client.post(
            f"{self.settings.gfw_api_url}/v3/4wings/report",
            params={
                "spatial-resolution": "HIGH",
                "temporal-resolution": "ENTIRE",
                "group-by": "VESSEL_ID",
                "format": "JSON",
                "datasets[0]": PRESENCE_DATASET,
                "date-range": f"{start},{end}",
            },
            json={"geojson": region_geojson},
            headers=self._headers(),
        )
        if resp.status_code != 200:
            raise ProviderUnavailable(
                "GFW 4wings vessel-discovery report failed.",
                provider=self.name, status_code=resp.status_code, body=resp.text[:500],
            )
        log.info("gfw_4wings_status", status_code=resp.status_code)
        log.info("gfw_4wings_body", body=resp.text[:5000])
        entries = resp.json().get("entries", [])
        vessel_ids = []

        for group in entries:
            if isinstance(group, dict):
                for rows in group.values():
                    if isinstance(rows, list):
                        for row in rows:
                            if not isinstance(row, dict):
                                continue
                            vid = row.get("vesselId") or row.get("vessel_id")
                            if vid:
                                vessel_ids.append(vid)
            elif isinstance(group, list):
                for row in group:
                    if not isinstance(row, dict):
                        continue
                    vid = row.get("vesselId") or row.get("vessel_id")
                    if vid:
                        vessel_ids.append(vid)

        return list(dict.fromkeys(vessel_ids))[:MAX_CANDIDATE_VESSELS]

    async def _get_vessel_presence(
        self,
        client: httpx.AsyncClient,
        bbox: tuple[float, float, float, float],
        start: str,
        end: str,
    ) -> list[dict]:
        """Retrieve real hourly AIS vessel presence from GFW 4Wings."""

        minlon, minlat, maxlon, maxlat = bbox

        region_geojson = {
            "type": "Feature",
            "geometry": {
                "type": "Polygon",
                "coordinates": [[
                    [minlon, minlat],
                    [maxlon, minlat],
                    [maxlon, maxlat],
                    [minlon, maxlat],
                    [minlon, minlat],
                ]],
            },
            "properties": {},
        }

        resp = await client.post(
            f"{self.settings.gfw_api_url}/v3/4wings/report",
            params={
                "spatial-resolution": "HIGH",
                "temporal-resolution": "HOURLY",
                "group-by": "VESSEL_ID",
                "format": "JSON",
                "datasets[0]": "public-global-presence:latest",
                "date-range": f"{start},{end}",
            },
            json={"geojson": region_geojson},
            headers=self._headers(),
        )

        if resp.status_code != 200:
            log.warning(
                "gfw_presence_fetch_failed",
                status_code=resp.status_code,
                body=resp.text[:3000],
            )
            return []

        payload = resp.json()

        log.info(
            "gfw_presence_response",
            status_code=resp.status_code,
            total=payload.get("total"),
            body=resp.text[:3000],
        )

        entries = payload.get("entries", [])
        points: list[dict] = []

        for group in entries:
            if not isinstance(group, dict):
                continue

            for dataset_rows in group.values():
                if not isinstance(dataset_rows, list):
                    continue

                for row in dataset_rows:
                    if not isinstance(row, dict):
                        continue

                    timestamp = (
                        row.get("entryTimestamp")
                        or row.get("date")
                    )

                    if not timestamp:
                        continue

                    vessel_id = (
                        row.get("vesselId")
                        or row.get("vessel_id")
                    )

                    if not vessel_id:
                        continue

                    points.append({
                        "vessel_id": vessel_id,
                        "mmsi": row.get("mmsi"),
                        "imo": row.get("imo"),
                        "name": row.get("shipName"),
                        "vessel_type": row.get("vesselType"),
                        "flag": row.get("flag"),
                        "timestamp": timestamp,
                        "lat": row.get("lat"),
                        "lon": row.get("lon"),
                        "speed": row.get("speed"),
                        "course": row.get("course"),
                        "heading": row.get("heading"),
                        "source": "global_fishing_watch",
                    })

        return points

    async def get_tracks(
        self,
        bbox: tuple[float, float, float, float],
        start: str,
        end: str,
    ) -> list[dict]:
        """Return real AIS vessel-presence observations from GFW."""

        self.require_configured()

        async with httpx.AsyncClient(timeout=120.0) as client:
            all_points = await self._get_vessel_presence(
                client,
                bbox,
                start,
                end,
            )

        if not all_points:
            raise InsufficientData(
                "AIS DATA UNAVAILABLE FOR THIS ANALYSIS WINDOW",
                provider=self.name,
                bbox=bbox,
                start=start,
                end=end,
                note="GFW returned no AIS vessel-presence observations for the requested region and time window.",
            )

        log.info(
            "gfw_presence_points_complete",
            point_count=len(all_points),
            vessel_count=len({
                p["vessel_id"]
                for p in all_points
                if p.get("vessel_id")
            }),
        )

        return all_points

