"""
These tests need no network and no database. They exist to prove, in code,
the two rules that matter most in the spec:

  1. SYNTHETIC_DEMO provenance can never be returned while APP_MODE=real.
  2. Calling a real provider with no credentials raises
     ProviderNotConfigured -- it never falls back to fabricated data.
"""
import pytest

from app.config import AppMode
from app.core.exceptions import ModeIntegrityError, ProviderNotConfigured
from app.core.provenance import DataKind, Provenance
from app.providers.sentinel1.cdse import CDSESentinel1Provider


def make_settings(**overrides):
    from app.config import Settings
    return Settings(**overrides)


def test_synthetic_provenance_allowed_in_demo_mode():
    p = Provenance(kind=DataKind.SYNTHETIC, source="demo-fixture")
    assert p.assert_allowed_in_mode(AppMode.DEMO) is p


def test_synthetic_provenance_rejected_in_real_mode():
    p = Provenance(kind=DataKind.SYNTHETIC, source="demo-fixture")
    with pytest.raises(ModeIntegrityError):
        p.assert_allowed_in_mode(AppMode.REAL)


def test_real_provenance_allowed_in_real_mode():
    p = Provenance(kind=DataKind.REAL, source="Copernicus Data Space Ecosystem")
    assert p.assert_allowed_in_mode(AppMode.REAL) is p


@pytest.mark.asyncio
async def test_sentinel1_provider_refuses_without_credentials():
    settings = make_settings(CDSE_CLIENT_ID=None, CDSE_CLIENT_SECRET=None)
    provider = CDSESentinel1Provider(settings)
    assert provider.is_configured() is False
    with pytest.raises(ProviderNotConfigured) as exc_info:
        await provider.search_scenes((68.0, 21.0, 70.0, 23.0), "2026-03-01T00:00:00Z", "2026-03-15T00:00:00Z")
    assert exc_info.value.reason_code == "PROVIDER_NOT_CONFIGURED"
    assert "CDSE_CLIENT_ID" in exc_info.value.context["required_credentials"]


def test_sentinel1_provider_reports_configured_when_credentials_present():
    settings = make_settings(CDSE_CLIENT_ID="x", CDSE_CLIENT_SECRET="y")
    provider = CDSESentinel1Provider(settings)
    assert provider.is_configured() is True
    status = provider.status()
    assert status["configured"] is True
    assert status["name"] == "sentinel1_cdse"
