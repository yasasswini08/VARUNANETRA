from functools import lru_cache

from app.config import get_settings
from app.providers.cmems.copernicus_marine import CopernicusMarineProvider


@lru_cache
def get_cmems_provider() -> CopernicusMarineProvider:
    return CopernicusMarineProvider(get_settings())
