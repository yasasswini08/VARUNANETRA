"""
Copernicus Data Space Ecosystem (CDSE) Sentinel-1 provider.

Real endpoints used (verify against https://documentation.dataspace.copernicus.eu
before a production run -- CDSE has changed paths before, and this module
should fail loudly rather than silently if they change again):

  Token   : POST {CDSE_TOKEN_URL}                 (OAuth2 client_credentials)
  Search  : GET  {CDSE_STAC_URL}/search            (STAC API, OGC filter)
  Download: GET  {CDSE_DOWNLOAD_URL}/Products({id})/$value  (OData zipper)

Auth: CDSE issues OAuth2 clients under Account -> Settings on
https://dataspace.copernicus.eu. CDSE also accepts username/password grants,
but client_credentials is used here because it is the credential type that
does not expire on a human login schedule, which matters for a Celery worker.

This module makes zero network calls at import time and zero calls at
construction time -- `is_configured()` only inspects the settings object.
The first real HTTP call happens inside `search_scenes`/`download_scene`,
each guarded by `require_configured()`.
"""
from __future__ import annotations

import datetime as dt
from typing import Any
from pathlib import Path

import httpx
import datetime as dt
from pathlib import Path
from typing import Any
from app.config import Settings
from app.core.exceptions import InsufficientData, ProviderUnavailable
from app.core.logging import get_logger
from app.core.provenance import DataKind, Provenance
from app.providers.base import SatelliteProvider, SceneRef

log = get_logger(__name__)

COLLECTION = "sentinel-1-grd"


class CDSESentinel1Provider(SatelliteProvider):
    name = "sentinel1_cdse"
    required_credentials = ("CDSE_CLIENT_ID", "CDSE_CLIENT_SECRET")

    def __init__(self, settings: Settings):
        self.settings = settings
        self._token: str | None = None
        self._token_expiry: dt.datetime | None = None

    def is_configured(self) -> bool:
        return bool(self.settings.cdse_client_id and self.settings.cdse_client_secret)

    async def _get_token(self, client: httpx.AsyncClient) -> str:
        if self._token and self._token_expiry and dt.datetime.now(dt.timezone.utc) < self._token_expiry:
            return self._token
        resp = await client.post(
            self.settings.cdse_token_url,
            data={
                "grant_type": "client_credentials",
                "client_id": self.settings.cdse_client_id,
                "client_secret": self.settings.cdse_client_secret,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        if resp.status_code != 200:
            raise ProviderUnavailable(
                "CDSE token request failed.",
                provider=self.name, status_code=resp.status_code, body=resp.text[:500],
            )
        payload = resp.json()
        self._token = payload["access_token"]
        # refresh 60s early to avoid racing expiry mid-request
        self._token_expiry = dt.datetime.now(dt.timezone.utc) + dt.timedelta(
            seconds=max(30, payload.get("expires_in", 300) - 60)
        )
        return self._token

    async def search_scenes(
        self, bbox: tuple[float, float, float, float],
        start: str, end: str, max_results: int = 20,
    ) -> list[SceneRef]:
        self.require_configured()
        minlon, minlat, maxlon, maxlat = bbox
        async with httpx.AsyncClient(timeout=30.0) as client:
            token = await self._get_token(client)
            body = {
                "collections": [COLLECTION],
                "bbox": [minlon, minlat, maxlon, maxlat],
                "datetime": f"{start}/{end}",
                "limit": max_results,
            }
            resp = await client.post(
                f"{self.settings.cdse_stac_url}/search",
                json=body,
                headers={"Authorization": f"Bearer {token}"},
            )
            if resp.status_code != 200:
                raise ProviderUnavailable(
                    "Sentinel-1 scene search failed.",
                    provider=self.name, status_code=resp.status_code, body=resp.text[:500],
                )
            features = resp.json().get("features", [])

        scenes: list[SceneRef] = []
        for f in features:
            props = f.get("properties", {})
            scenes.append(SceneRef(
                product_id=f.get("id"),
                collection=COLLECTION,
                acquisition_time=props.get("datetime"),
                orbit_direction=props.get("sat:orbit_state"),
                polarizations=props.get("sar:polarizations"),
                product_type=props.get("product:type"),
                geometry=f.get("geometry"),
                bbox=f.get("bbox"),
                assets=f.get("assets", {}),
                source_url=f.get("links", [{}])[0].get("href"),
                provenance=Provenance(
                    kind=DataKind.REAL,
                    source="Copernicus Data Space Ecosystem",
                    dataset="SENTINEL-1 GRD",
                    product_id=f.get("id"),
                    time_start=props.get("datetime"),
                    bbox=list(bbox),
                    source_url=f.get("links", [{}])[0].get("href"),
                ).model_dump(mode="json"),
            ))
        if not scenes:
            log.info("sentinel1_search_empty", bbox=bbox, start=start, end=end)
        return scenes

    async def get_scene(self, product_id: str) -> SceneRef:
        self.require_configured()
        async with httpx.AsyncClient(timeout=30.0) as client:
            token = await self._get_token(client)
            resp = await client.get(
                f"{self.settings.cdse_stac_url}/collections/{COLLECTION}/items/{product_id}",
                headers={"Authorization": f"Bearer {token}"},
            )
            if resp.status_code != 200:
                raise ProviderUnavailable(
                    "Sentinel-1 scene lookup failed.",
                    provider=self.name,
                    status_code=resp.status_code,
                    product_id=product_id,
                )
            return SceneRef(resp.json())

    async def download_scene(self, product_id: str, dest_path: str) -> str:
        """Download the full Sentinel-1 GRD product archive from CDSE."""

        self.require_configured()

        async with httpx.AsyncClient(timeout=None) as client:
            token = await self._get_token(client)
            headers = {"Authorization": f"Bearer {token}"}

            stac_url = (
                f"{self.settings.cdse_stac_url}"
                f"/collections/{COLLECTION}/items/{product_id}"
            )

            scene_resp = await client.get(
                stac_url,
                headers=headers,
                timeout=30.0,
            )

        if scene_resp.status_code != 200:
            if 400 <= scene_resp.status_code < 500:
                raise InsufficientData(
                    "Sentinel-1 product was not found or is invalid.",
                    provider=self.name,
                    status_code=scene_resp.status_code,
                    product_id=product_id,
                    body=scene_resp.text[:500],
                )

            raise ProviderUnavailable(
                "Sentinel-1 STAC item lookup failed.",
                provider=self.name,
                status_code=scene_resp.status_code,
                product_id=product_id,
                body=scene_resp.text[:500],
            )

            scene = scene_resp.json()

            # CDSE exposes the full product archive through the
            # STAC asset/link structure rather than assets["product"].
            archive_url = None

            # Find the actual full-product OData URL.
            # Measurement assets also contain /Products(UUID)/Nodes(...),
            # so only accept a URL that ends directly in /Products(UUID)/$value.
            import re

            product_pattern = re.compile(
                r"/odata/v1/Products\([^)]+\)/\$value$"
            )

            # Check STAC assets.
            for asset in scene.get("assets", {}).values():
                candidates = [
                    asset.get("href", ""),
                    asset.get("alternate", {})
                        .get("https", {})
                        .get("href", ""),
                ]

                for href in candidates:
                    if product_pattern.search(href):
                        archive_url = href
                        break

                if archive_url:
                    break

            # Check STAC links as a fallback.
            if not archive_url:
                for link in scene.get("links", []):
                    href = link.get("href", "")

                    if product_pattern.search(href):
                        archive_url = href
                        break

            if not archive_url:
                raise ProviderUnavailable(
                    "Sentinel-1 product archive URL not found.",
                    provider=self.name,
                    product_id=product_id,
                )

            log.info(
                "sentinel1_download_archive",
                product_id=product_id,
                url=archive_url,
            )

            async with client.stream(
                "GET",
                archive_url,
                headers=headers,
            ) as resp:
                if resp.status_code != 200:
                    body = await resp.aread()

                    raise ProviderUnavailable(
                        "Sentinel-1 product archive download failed.",
                        provider=self.name,
                        status_code=resp.status_code,
                        product_id=product_id,
                        body=body[:500].decode(
                            "utf-8",
                            errors="replace",
                        ),
                    )

                with open(dest_path, "wb") as f:
                    async for chunk in resp.aiter_bytes(
                        chunk_size=1 << 20
                    ):
                        f.write(chunk)

            log.info(
                "sentinel1_download_finished",
                product_id=product_id,
                dest_path=dest_path,
                exists=Path(dest_path).exists(),
                size=Path(dest_path).stat().st_size
                if Path(dest_path).exists()
                else 0,
            )

        return dest_path