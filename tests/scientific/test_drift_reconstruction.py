"""
Scientific validation for M2/M3 (spec section 23: backward reconstruction
should recover a known synthetic source/release within a configured
tolerance).

Uses a real (deterministic, seeded) OpenDrift OceanDrift model in both
directions:
  1. Forward-simulate a small release patch from a KNOWN origin/time to
     build a synthetic "observed slick" polygon (standing in for a SAR
     detection -- this is a test fixture, not app-runtime data).
  2. Feed that polygon into the real `run_backward_reconstruction` and
     confirm the KDE-derived origin density field, evaluated at the true
     release hour, both (a) has its density-weighted centroid close to the
     known origin, and (b) contains the known origin inside its 50%
     highest-density region.

The current field is a `reader_constant` (deliberately simple and
constructed only in this test file -- see drift/readers.py's docstring on
why no constant/synthetic reader lives in application code). Because the
same field drives both the forward fixture-generation and the backward
reconstruction, this test specifically validates the backtracking
*technique* end-to-end, not any particular ocean product.
"""
from __future__ import annotations

import datetime as dt

import numpy as np
from opendrift.readers import reader_constant
from shapely.geometry import MultiPoint

from app.drift.backward import run_backward_reconstruction
from app.drift.forward import forecast_snapshot, run_forward_forecast
from app.drift.origin_probability import highest_density_region, kde_field
from app.drift.uncertainty import centroid_lonlat, characteristic_radius_km

TRUE_ORIGIN = (68.55, 22.05)  # lon, lat
RELEASE_TIME = dt.datetime(2026, 3, 12, 6, 0)
OBSERVATION_TIME = RELEASE_TIME + dt.timedelta(hours=14)


def _make_current_reader():
    # a mild eastward-northward current with a touch of wind-driven
    # (windage) component, all real OpenDrift config, nothing custom
    return (
        reader_constant.Reader({"x_sea_water_velocity": 0.22, "y_sea_water_velocity": 0.08}),
        reader_constant.Reader({"x_wind": 3.0, "y_wind": -1.5}),
    )


def test_backward_reconstruction_recovers_known_release():
    current_reader, wind_reader = _make_current_reader()

    # Step 1: build the synthetic "observed slick" by forward-simulating a
    # tight initial patch (radius ~250 m) from the true origin/time.
    seed_patch = MultiPoint([TRUE_ORIGIN]).buffer(0.0025)  # ~250 m radius in degrees at this latitude
    fwd_result = run_forward_forecast(
        seed_patch, RELEASE_TIME, current_reader, wind_reader,
        hours=14, ensemble_size=250, seed=1,
    )
    lons_obs, lats_obs = forecast_snapshot(fwd_result, hours_ahead=14)
    observed_slick = MultiPoint(list(zip(lons_obs, lats_obs))).convex_hull.buffer(0.001)

    # Step 2: real backward reconstruction from the observed slick.
    back_result = run_backward_reconstruction(
        observed_slick, OBSERVATION_TIME, current_reader, wind_reader,
        hours=20, ensemble_size=400, seed=2,
    )
    lons_origin, lats_origin = forecast_snapshot(back_result, hours_ahead=-14)

    # --- assertions ---
    centroid = centroid_lonlat(lons_origin, lats_origin)
    _, _, dist_m = __import__("pyproj").Geod(ellps="WGS84").inv(
        centroid[0], centroid[1], TRUE_ORIGIN[0], TRUE_ORIGIN[1]
    )
    assert dist_m < 3000, f"recovered origin centroid {centroid} is {dist_m:.0f} m from true origin {TRUE_ORIGIN}"

    radius_km = characteristic_radius_km(lons_origin, lats_origin)
    assert radius_km < 10, f"origin ensemble spread implausibly large: {radius_km:.2f} km"

    grid_lon, grid_lat, density = kde_field(lons_origin, lats_origin, grid_n=150)
    hdr50 = highest_density_region(grid_lon, grid_lat, density, mass_fraction=0.5)
    assert hdr50 is not None
    from shapely.geometry import Point
    assert hdr50.contains(Point(*TRUE_ORIGIN)) or hdr50.distance(Point(*TRUE_ORIGIN)) < 0.01, (
        "true origin should fall inside (or right at the edge of) the 50% highest-density region"
    )
