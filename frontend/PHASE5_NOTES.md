# Phase 5 — Evidence, Report, History, polish (frontend only)

Backend untouched. Endpoints used in Phase 5:
- `GET /reports?incident_id=` list · `POST /reports/{incident_id}/generate` · `GET /reports/{id}` (streams the PDF)
- `GET /pasha` (all runs, for history) · `GET /pasha?incident_id=` · `GET /pasha/{run_id}`
- `GET /incidents`, `GET /incidents/{id}`, `GET /observations`, `GET /scenes`, `GET /drift/{id}` (unchanged from Phase 3–4)

Routes added: `/investigations/:id/evidence`, `/investigations/:id/report`, `/history/:id`. `/history` rewritten.

## What is real
- Report generation is a real backend capability: the button calls POST …/generate with the selected stored PASHA run, the observed slick polygon, and scene/detection metadata built only from values already fetched (empty keys are dropped, never placeholders). Open/Download fetch the real PDF as a blob.
- The on-page report is a browser-assembled preview of the same stored results; it is not the PDF. "Print preview" uses the browser print dialog.

## Backend limitations surfaced (not hidden, not faked)
- No evidence graph / relationships → the Evidence view is a **timeline in pipeline order**. Timestamps appear only where the backend returns one (detection provenance, PASHA history, report list). Drift, vessels and observation-derived items show "No timestamp returned".
- No investigation table → history rows are incident records (incident ID = investigation ID). Stage per row is derived from observations, scenes, PASHA runs and reports only.
- Failures are not persisted, so past-investigation stages show NOT EXECUTED (no stored artefact), never FAILED. M2/M4 summaries are not stored server-side; they are known only if this browser cached them or a later stage recorded them.
- No confidence rating anywhere → "Confidence information not provided by backend." Backend uncertainty (± km) and scores are shown as raw values.
- Report PDFs live on the backend host's disk (MinIO disabled); if the file is gone the backend says so and the UI shows that error.
- `report_path` and `density_field_path` (server paths) are never displayed.

## Status vocabulary
READY · RUNNING · COMPLETE · FAILED · UNAVAILABLE · NOT EXECUTED · DEMO · LIVE (`lib/status.ts`, `CanonStatus`). Stage badges everywhere use it.
Case studies live in `src/data/demo/` and are labelled DEMO.
