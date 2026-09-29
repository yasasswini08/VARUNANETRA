"""
The 4wings-discovery -> per-vessel-track HTTP flow can't be exercised
against the real GFW API from this sandbox (no egress to
gateway.api.globalfishingwatch.org), so respx mocks exactly the two request
shapes gfw.py issues and asserts the provider assembles their responses
correctly -- this tests the code's HTTP contract and response parsing, not
GFW's actual current API surface (see gfw.py's docstring on that risk).
"""
import httpx
import pytest
import respx

from app.config import Settings
from app.core.exceptions import InsufficientData, ProviderNotConfigured
from app.providers.ais.gfw import GFWAISProvider


def make_settings(**overrides):
    return Settings(**overrides)


def test_not_configured_without_token():
    provider = GFWAISProvider(make_settings(GFW_API_TOKEN=None))
    assert provider.is_configured() is False


@pytest.mark.asyncio
async def test_refuses_without_token():
    provider = GFWAISProvider(make_settings(GFW_API_TOKEN=None))
    with pytest.raises(ProviderNotConfigured):
        await provider.get_tracks((68.0, 21.0, 70.0, 23.0), "2026-03-10T00:00:00Z", "2026-03-12T00:00:00Z")


@pytest.mark.asyncio
@respx.mock
async def test_discovery_then_track_fetch_assembles_points():
    settings = make_settings(GFW_API_TOKEN="test-token")
    provider = GFWAISProvider(settings)

    respx.post(f"{settings.gfw_api_url}/v3/4wings/report").mock(
        return_value=httpx.Response(200, json={"entries": [[{"vessel_id": "vid-1"}, {"vessel_id": "vid-2"}]]})
    )
    respx.get(f"{settings.gfw_api_url}/v3/vessels/vid-1/tracks").mock(
        return_value=httpx.Response(200, json={
            "features": [{
                "geometry": {"coordinates": [[68.6, 22.1], [68.61, 22.11]]},
                "properties": {"times": ["2026-03-10T01:00:00Z", "2026-03-10T02:00:00Z"],
                               "mmsi": "111", "shipname": "MT One", "speed": 8.5},
            }],
        })
    )
    respx.get(f"{settings.gfw_api_url}/v3/vessels/vid-2/tracks").mock(
        return_value=httpx.Response(200, json={"features": []})
    )

    points = await provider.get_tracks((68.0, 21.0, 70.0, 23.0), "2026-03-10T00:00:00Z", "2026-03-12T00:00:00Z")
    assert len(points) == 2
    assert points[0]["mmsi"] == "111"
    assert points[0]["name"] == "MT One"
    assert points[0]["lon"] == 68.6 and points[0]["lat"] == 22.1


@pytest.mark.asyncio
@respx.mock
async def test_no_vessels_discovered_raises_insufficient_data_with_exact_spec_message():
    settings = make_settings(GFW_API_TOKEN="test-token")
    provider = GFWAISProvider(settings)

    respx.post(f"{settings.gfw_api_url}/v3/4wings/report").mock(
        return_value=httpx.Response(200, json={"entries": []})
    )

    with pytest.raises(InsufficientData) as exc_info:
        await provider.get_tracks((68.0, 21.0, 70.0, 23.0), "2026-03-10T00:00:00Z", "2026-03-12T00:00:00Z")
    assert exc_info.value.message == "AIS DATA UNAVAILABLE FOR THIS ANALYSIS WINDOW"
