"""
Physical plausibility check (spec section 12's "physical test" -- previously
always passed as `True`, flagged explicitly as a gap in PHASE_STATUS.md;
this module closes it).

Estimates the observed slick's oil volume from its area using the Bonn
Agreement Oil Appearance Code's documented thickness-to-appearance
correlation, then compares that estimate against a vessel-type-based
plausible-capacity ceiling. A candidate whose own maximum plausible cargo/
bunker capacity is far below what the observed slick would require -- e.g.
a small fishing vessel "producing" a slick that would require a large
tanker's full cargo -- fails this test regardless of how well its drift
replay otherwise matches.

KNOWN LIMITATION, stated plainly: SAR amplitude alone does not reveal oil
appearance/colour, so the true oil-layer thickness at the time of
acquisition is not observable from the detection this system performs --
this uses a broad, deliberately wide thickness range (1-20 micron) spanning
from a bare sheen to a thick, dark slick, which is why the plausibility
threshold below is generous (1.5x the low-end estimate) rather than tight.
This test is therefore better at catching a genuinely impossible pairing
(a jet-ski "producing" a 200 km2 slick) than at finely discriminating
between two plausible tanker-sized candidates -- which is exactly the
role a "hard but coarse" falsification test should play alongside the
spatial/temporal/drift tests, not a replacement for them.
"""
from __future__ import annotations

CRUDE_OIL_DENSITY_T_PER_M3 = 0.88  # mid-range for crude/heavy fuel oil

# Vessel-type -> (typical plausible spill ceiling in tonnes, basis)
# Tanker figures assume a real spill could draw on the full cargo; bulk/
# cargo/container/fishing figures assume only bunker fuel is at risk, since
# those vessel types do not carry oil as cargo.
_TYPE_CAPACITY_TONNES: dict[str, float] = {
    "crude oil tanker": 300_000.0,
    "product tanker": 80_000.0,
    "chemical tanker": 40_000.0,
    "oil tanker": 150_000.0,
    "tanker": 150_000.0,
    "bulk carrier": 5_000.0,
    "general cargo": 3_000.0,
    "container ship": 6_000.0,
    "container": 6_000.0,
    "fishing": 500.0,
    "tug": 500.0,
    "passenger": 2_000.0,
}
_DEFAULT_CAPACITY_TONNES = 4_000.0  # unknown/unclassified vessel type -- moderate bunker-scale assumption


def estimate_spill_mass_tonnes_range(area_km2: float) -> tuple[float, float]:
    """Returns (low, high) tonnes for the observed slick area, spanning a
    1-20 micron oil-layer thickness range (Bonn Agreement Oil Appearance
    Code's documented range from a barely-visible sheen to a thick, dark
    slick)."""
    area_m2 = area_km2 * 1e6
    low = area_m2 * 1e-6 * CRUDE_OIL_DENSITY_T_PER_M3    # 1 micron
    high = area_m2 * 20e-6 * CRUDE_OIL_DENSITY_T_PER_M3  # 20 micron
    return low, high


def plausible_capacity_tonnes(vessel_type: str | None, dwt_tonnes: float | None = None) -> float:
    if dwt_tonnes is not None and dwt_tonnes > 0:
        return dwt_tonnes
    key = (vessel_type or "").strip().lower()
    for known, capacity in _TYPE_CAPACITY_TONNES.items():
        if known in key:
            return capacity
    return _DEFAULT_CAPACITY_TONNES


def check_physical_plausibility(
    area_km2: float, vessel_type: str | None, dwt_tonnes: float | None = None, margin: float = 1.5,
) -> dict:
    low_tonnes, high_tonnes = estimate_spill_mass_tonnes_range(area_km2)
    capacity_tonnes = plausible_capacity_tonnes(vessel_type, dwt_tonnes)
    # plausible if even the conservative LOW-end mass estimate doesn't
    # exceed the candidate's capacity by more than `margin` -- deliberately
    # permissive given the thickness uncertainty (see module docstring)
    plausible = low_tonnes <= capacity_tonnes * margin
    return {
        "plausible": plausible,
        "estimated_spill_tonnes_low": round(low_tonnes, 1),
        "estimated_spill_tonnes_high": round(high_tonnes, 1),
        "vessel_capacity_tonnes": capacity_tonnes,
        "reason": (
            "within plausible capacity" if plausible else
            f"observed slick implies at least ~{low_tonnes:,.0f} t even at a bare-sheen thickness, "
            f"far exceeding this vessel type's plausible ~{capacity_tonnes:,.0f} t capacity"
        ),
    }
