import pytest

from app.config import Settings
from app.core.exceptions import ProviderNotConfigured
from app.providers.cmems.copernicus_marine import CopernicusMarineProvider
from app.providers.era5.cds import CDSEra5Provider


def make_settings(**overrides):
    return Settings(**overrides)


# ---------------- ERA5 ----------------

def test_era5_not_configured_without_key():
    provider = CDSEra5Provider(make_settings(CDS_API_KEY=None))
    assert provider.is_configured() is False


def test_era5_configured_with_key():
    provider = CDSEra5Provider(make_settings(CDS_API_KEY="abcd1234"))
    assert provider.is_configured() is True
    status = provider.status()
    assert status["name"] == "era5_cds"
    assert status["configured"] is True


@pytest.mark.asyncio
async def test_era5_refuses_without_credentials():
    provider = CDSEra5Provider(make_settings(CDS_API_KEY=None))
    with pytest.raises(ProviderNotConfigured) as exc_info:
        await provider.get_wind_field((68.0, 21.0, 70.0, 23.0), "2026-03-10T00:00:00Z", "2026-03-11T00:00:00Z")
    assert exc_info.value.reason_code == "PROVIDER_NOT_CONFIGURED"
    assert exc_info.value.context["required_credentials"] == ["CDS_API_KEY"]


# ---------------- CMEMS ----------------

def test_cmems_not_configured_without_credentials():
    provider = CopernicusMarineProvider(make_settings(CMEMS_USERNAME=None, CMEMS_PASSWORD=None))
    assert provider.is_configured() is False


def test_cmems_not_configured_with_only_username():
    """Both username AND password are required -- one alone must not read as configured."""
    provider = CopernicusMarineProvider(make_settings(CMEMS_USERNAME="analyst", CMEMS_PASSWORD=None))
    assert provider.is_configured() is False


def test_cmems_configured_with_both_credentials():
    provider = CopernicusMarineProvider(make_settings(CMEMS_USERNAME="analyst", CMEMS_PASSWORD="secret"))
    assert provider.is_configured() is True


@pytest.mark.asyncio
async def test_cmems_refuses_without_credentials():
    provider = CopernicusMarineProvider(make_settings(CMEMS_USERNAME=None, CMEMS_PASSWORD=None))
    with pytest.raises(ProviderNotConfigured) as exc_info:
        await provider.get_current_field((68.0, 21.0, 70.0, 23.0), "2026-03-10T00:00:00Z", "2026-03-11T00:00:00Z")
    assert exc_info.value.reason_code == "PROVIDER_NOT_CONFIGURED"
    assert set(exc_info.value.context["required_credentials"]) == {"CMEMS_USERNAME", "CMEMS_PASSWORD"}
