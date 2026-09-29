"""
Provider abstraction (spec section 3 / 21: GET /api/providers/status).

Every concrete provider:
  1. declares `name` and `required_credentials`
  2. implements `is_configured()` truthfully from those credentials
  3. raises ProviderNotConfigured from any data method if not configured
  4. raises ProviderUnavailable if the upstream call fails, rate-limits, or
     returns nothing for the requested window
  5. never returns a value without an attached Provenance

No provider is instantiated as a working client until credentials exist --
`is_configured()` is checked at the API layer before any provider method is
called, so callers get a clean 424 with a reason code rather than a stack
trace three layers down.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from app.core.exceptions import ProviderNotConfigured


class BaseProvider(ABC):
    name: str = "base"
    required_credentials: tuple[str, ...] = ()

    @abstractmethod
    def is_configured(self) -> bool:
        ...

    def require_configured(self) -> None:
        if not self.is_configured():
            raise ProviderNotConfigured(
                "Provider not configured.",
                provider=self.name,
                required_credentials=list(self.required_credentials),
            )

    def status(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "configured": self.is_configured(),
            "required_credentials": list(self.required_credentials),
        }


class SceneRef(dict):
    """Lightweight typed-dict-style handle returned by scene search, kept as a
    plain dict so it round-trips through the API layer without a bespoke
    schema per provider."""


class SatelliteProvider(BaseProvider):
    @abstractmethod
    async def search_scenes(
        self, bbox: tuple[float, float, float, float],
        start: str, end: str, max_results: int = 20,
    ) -> list[SceneRef]:
        ...

    @abstractmethod
    async def get_scene(self, product_id: str) -> SceneRef:
        ...

    @abstractmethod
    async def download_scene(self, product_id: str, dest_path: str) -> str:
        ...


class WindProvider(BaseProvider):
    @abstractmethod
    async def get_wind_field(
        self, bbox: tuple[float, float, float, float],
        start: str, end: str,
    ):
        """Returns an xarray.Dataset with u10/v10 plus a Provenance object."""
        ...


class CurrentProvider(BaseProvider):
    @abstractmethod
    async def get_current_field(
        self, bbox: tuple[float, float, float, float],
        start: str, end: str,
    ):
        """Returns an xarray.Dataset with uo/vo plus a Provenance object."""
        ...


class AISProvider(BaseProvider):
    @abstractmethod
    async def get_tracks(
        self, bbox: tuple[float, float, float, float],
        start: str, end: str,
    ) -> list[dict]:
        """Returns real vessel track points. Must raise InsufficientData
        (not return []) when the upstream genuinely has nothing, so the
        caller can distinguish 'no vessels in the region' from
        'this call is broken'."""
        ...
