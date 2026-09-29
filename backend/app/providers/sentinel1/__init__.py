from functools import lru_cache

from app.config import get_settings
from app.providers.sentinel1.cdse import CDSESentinel1Provider


@lru_cache
def get_sentinel1_provider() -> CDSESentinel1Provider:
    return CDSESentinel1Provider(get_settings())
