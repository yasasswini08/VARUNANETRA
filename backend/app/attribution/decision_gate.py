"""
Decision engine (spec section 13). Deterministic, configurable, and
explicit that a candidate is never forced into LEADING: if nothing clears
the margin/min-score bar, the outcome is H0_UNKNOWN_SOURCE, full stop.
"""
from __future__ import annotations

from app.config import Settings


def decide(candidates: list[dict], settings: Settings) -> dict:
    """`candidates` is a list of dicts each carrying at least
    `vessel_key`, `overall_score` (M4) and `falsification` (this phase's
    gate result, with `pass_fail` and `physical_consistency_score`).
    Mutates each candidate's `status` field in place and returns the
    overall investigation outcome."""
    survivors = [c for c in candidates if c["falsification"]["pass_fail"]]

    if not survivors:
        for c in candidates:
            c["status"] = "REJECTED"
        return {
            "status": "H0_UNKNOWN_SOURCE",
            "reason": "No candidate vessel survived the falsification gate.",
            "leading_candidate": None,
            "margin": None,
        }

    survivors.sort(key=lambda c: c["falsification"]["physical_consistency_score"], reverse=True)
    top = survivors[0]
    margin = (
        top["falsification"]["physical_consistency_score"] - survivors[1]["falsification"]["physical_consistency_score"]
        if len(survivors) > 1 else top["falsification"]["physical_consistency_score"]
    )

    is_leading = (
        top["falsification"]["physical_consistency_score"] >= settings.decision_leading_min_score
        and margin >= settings.decision_leading_margin
    )

    rejected_keys = {c["vessel_key"] for c in candidates} - {s["vessel_key"] for s in survivors}
    for c in candidates:
        if c["vessel_key"] in rejected_keys:
            c["status"] = "REJECTED"
        elif is_leading and c["vessel_key"] == top["vessel_key"]:
            c["status"] = "LEADING"
        elif is_leading:
            c["status"] = "SECONDARY"
        else:
            c["status"] = "AMBIGUOUS"

    if is_leading:
        return {
            "status": "LEADING", "reason": f"Top candidate cleared margin {margin:.3f} >= {settings.decision_leading_margin}.",
            "leading_candidate": top["vessel_key"], "margin": round(margin, 4),
        }
    return {
        "status": "AMBIGUOUS",
        "reason": (
            f"{len(survivors)} candidate(s) survived falsification but did not separate by the configured "
            f"margin ({settings.decision_leading_margin}) or clear the minimum score "
            f"({settings.decision_leading_min_score})."
        ),
        "leading_candidate": None, "margin": round(margin, 4),
    }
