from functools import lru_cache

from app.config import get_settings
from app.providers.ais.gfw import GFWAISProvider


@lru_cache
def get_ais_provider() -> GFWAISProvider:
    return GFWAISProvider(get_settings())
