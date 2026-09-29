from functools import lru_cache

from app.config import get_settings
from app.providers.era5.cds import CDSEra5Provider


@lru_cache
def get_era5_provider() -> CDSEra5Provider:
    return CDSEra5Provider(get_settings())
