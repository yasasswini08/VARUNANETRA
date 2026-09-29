"""
Direct tests of the physical-plausibility check (spec section 12's
"physical test"), independent of the full drift/PASHA pipeline -- these
confirm the mass-balance logic itself, not just that it's wired in
somewhere.
"""
from app.attribution.physical_plausibility import (
    check_physical_plausibility, estimate_spill_mass_tonnes_range, plausible_capacity_tonnes,
)


def test_small_slick_plausible_for_any_vessel_type():
    """A modest 12 km2 slick (this repo's typical synthetic-fixture scale)
    implies only tens to a couple hundred tonnes even at a thick, dark
    appearance -- well within even a small vessel's bunker capacity."""
    result = check_physical_plausibility(area_km2=12.0, vessel_type="Fishing vessel")
    assert result["plausible"] is True
    assert result["estimated_spill_tonnes_high"] < result["vessel_capacity_tonnes"]


def test_large_slick_implausible_for_small_vessel():
    """A 2000 km2 slick -- large even by major-incident standards -- cannot
    plausibly have come from a small fishing vessel's bunker tanks alone,
    even under the most generous (bare-sheen, 1 micron) thickness
    assumption this check uses."""
    result = check_physical_plausibility(area_km2=2000.0, vessel_type="Fishing vessel")
    assert result["plausible"] is False
    assert "far exceeding" in result["reason"]


def test_large_slick_plausible_for_large_tanker():
    """The same large slick IS plausible for a crude oil tanker, whose
    cargo capacity is orders of magnitude larger."""
    result = check_physical_plausibility(area_km2=500.0, vessel_type="Crude oil tanker")
    assert result["plausible"] is True


def test_known_dwt_overrides_type_based_default():
    """A vessel with a known deadweight tonnage uses that figure directly
    rather than the generic type-based capacity table."""
    small_tanker_capacity = plausible_capacity_tonnes("Product tanker", dwt_tonnes=15_000.0)
    assert small_tanker_capacity == 15_000.0
    generic_tanker_capacity = plausible_capacity_tonnes("Product tanker")
    assert generic_tanker_capacity != small_tanker_capacity


def test_unknown_vessel_type_gets_conservative_default():
    capacity = plausible_capacity_tonnes(None)
    assert capacity == 4_000.0


def test_mass_estimate_scales_linearly_with_area():
    low1, high1 = estimate_spill_mass_tonnes_range(10.0)
    low2, high2 = estimate_spill_mass_tonnes_range(20.0)
    assert abs(low2 - 2 * low1) < 1e-6
    assert abs(high2 - 2 * high1) < 1e-6
    assert high1 > low1  # thickness range must produce a genuine spread, not a point estimate
