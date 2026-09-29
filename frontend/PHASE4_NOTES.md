# Phase 4 — Vessel Intelligence + PASHA Lab (frontend only)

Backend untouched. Endpoints used: GET /vessels/candidates, POST /pasha/run, GET /pasha/{run_id}, GET /pasha?incident_id=.
Routes: /investigations/:id/vessels, /vessels/:vesselId, /pasha, /pasha/hypotheses, /pasha/replay (selected run in ?run=, hypothesis in ?c=).

## Backend limitations surfaced in the UI (not hidden, not faked)
- POST /pasha/run is synchronous, returns no job id: indeterminate "running" state with a real elapsed timer only.
- /pasha/run replays every candidate you send; the decision (LEADING/AMBIGUOUS/REJECTED/H0_UNKNOWN_SOURCE) is computed over that submitted set.
- Result has no trajectory geometry, no overlap/centroid/arrival numbers (persisted in DB only), no evidence references: shown as "Not returned".
- Only score is physical_consistency_score + four pass/fail tests. /vessels/candidates has no track geometry, speed, heading, flag or provenance.
- No endpoint lists drift analyses by incident: analysis/vessel refs remain browser-cached (Phase 3 behaviour).
- Values computed in the browser are tagged "Derived in browser": vessel-to-origin distance, implied release time, slick vertex-mean endpoint.
