---
title: Varuna Netra API
emoji: 🌊
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
---

# Varuna Netra

Physics-constrained satellite oil-spill source attribution platform, built
for Smart India Hackathon 2026 (problem statement SIH26143).

Given a real Sentinel-1 SAR scene, Varuna Netra detects an oil-slick
candidate, reconstructs its probable origin and release-time window by
running a real Lagrangian drift model backward from the observation,
correlates real AIS vessel traffic against that origin, runs a
counterfactual forward replay ("could this specific vessel, at this
specific time, have physically produced *this* slick") for each candidate,
falsifies candidates that fail hard physical tests, and — only if a
candidate survives every test with a clear margin — names it LEADING. If
nothing survives, the system reports **H0 — Unknown Source** rather than
naming the least-implausible vessel. A PDF evidence dossier documents the
whole chain with full data provenance.

**This document is honest about what has and hasn't been run against real
external data.** See "What is actually verified" below before treating any
single number in this repo as validated against reality.

---

## Architecture

```
REAL SENTINEL-1 (Copernicus Data Space Ecosystem)
        |
        v
M1 DETECT      -- CFAR dark-spot detector, real SAR calibration + speckle filtering
        |
        v
M2 RECONSTRUCT -- real OpenDrift backward ensemble -> KDE origin probability field
        |
        v
M3 FORECAST    -- real OpenDrift forward ensemble -> +24/48/72h footprints
        |
        v
M4 CORRELATE   -- real AIS (Global Fishing Watch) vs. the origin field
        |
        v
M5 TEST (PASHA) -- real forward replay per candidate vs. the observed slick
        |
        +-- physically inconsistent --> REJECTED
        |
        +-- insufficient separation --> AMBIGUOUS
        |
        +-- consistent --> LEADING / SECONDARY
                           |
                           v
                   H0 if nobody survives
                           |
                           v
M6 REPORT      -- PDF evidence dossier + full provenance
```

Backend: FastAPI + PostGIS + Celery/Redis. Scientific stack: OpenDrift,
rasterio, shapely, pyproj, scikit-image. See `PHASE_STATUS.md` for a
phase-by-phase build log with exact verification evidence for each piece.

---

## Repository layout

```
varuna-netra/
  backend/
    app/
      main.py                 FastAPI entrypoint
      config.py                APP_MODE (real|demo) + every credential, as Settings
      core/                    provenance, exceptions, logging
      db/                      SQLAlchemy + GeoAlchemy2 models, repository, session
      providers/                sentinel1 (CDSE) / era5 (CDS) / cmems / ais (GFW)
      detection/               M1: calibration, speckle filter, CFAR, characterization
      drift/                   M2/M3: OpenDrift backward/forward ensembles, KDE fields
      vessels/                 AIS track interpolation, filtering, behaviour signals
      attribution/             M4 scoring, falsification gate, decision engine
      pasha/                   M5: hypothesis, replay, comparison, consistency score
      reports/                 M6: Jinja2 + WeasyPrint evidence dossier, SVG map
      jobs/                    Celery app + the full-investigation task
      api/                     one router per pipeline stage
    alembic/                  async-engine migrations (GeoAlchemy2-aware)
    scripts/health_check.py   real Celery/Redis liveness check
  scripts/prepare_scene.py    unpacks a downloaded CDSE .zip into a .SAFE dir
  tests/
    unit/                     provider guard-rail tests (no network, no DB)
    scientific/               numerical validation against synthetic fixtures
    integration/              real Postgres/Redis/HTTP round-trip tests (opt-in)
  docker-compose.yml          postgres+postgis, redis, minio, backend, worker, frontend
  docker/                     Dockerfiles
  .env.example                every credential this system uses, named exactly
  PHASE_STATUS.md             the real build log -- read this for what's proven vs. not
```

---

## Setup

### 1. Credentials

Copy `.env.example` to `.env` and fill in what you have. Nothing in this
system falls back to fake data when a credential is missing — a request
that needs it fails with a clear `424 PROVIDER_NOT_CONFIGURED` naming
exactly which variable to set.

| Provider | Get credentials at | Variables |
|---|---|---|
| Sentinel-1 (CDSE) | https://dataspace.copernicus.eu → Account → Settings → OAuth clients | `CDSE_CLIENT_ID`, `CDSE_CLIENT_SECRET` |
| ERA5 (CDS) | https://cds.climate.copernicus.eu/profile | `CDS_API_KEY` |
| CMEMS | https://data.marine.copernicus.eu | `CMEMS_USERNAME`, `CMEMS_PASSWORD` |
| AIS (GFW) | https://globalfishingwatch.org/our-apis/ | `GFW_API_TOKEN` |

Set `APP_MODE=real` once you have real credentials you intend to use in
production; `APP_MODE=demo` is a stricter flag than it sounds — see
`config.py` and `core/provenance.py`: no provider anywhere in this codebase
actually implements a synthetic-data fallback path, so `demo` mode
currently behaves identically to `real` mode except for a frontend banner
that hasn't been built yet (Phase 15). This is intentional per the spec's
"no fake fallbacks" rule, not an oversight.

### 2. Start the stack

```bash
docker compose up --build
```

Brings up Postgres+PostGIS, Redis, MinIO, the FastAPI backend, a Celery
worker, and the frontend dev server (once Phase 15 lands).

### 3. Run migrations

```bash
docker compose exec backend alembic upgrade head
```

This has been run for real (not just written) against a live PostgreSQL
16 + PostGIS 3.4 instance during development — see `PHASE_STATUS.md` phase
17 for the exact `apt-get`/`createdb`/`CREATE EXTENSION` sequence used, and
confirmation that the schema is stable across repeated `--autogenerate`
runs (no drift).

### 4. Confirm provider status

```bash
curl http://localhost:8000/api/providers/status
```

Tells you which of the four external providers currently have valid
credentials, without making any external calls.

### 5. Run the test suite

```bash
cd backend
pytest ../tests/                                    # unit + scientific tests, no external dependencies
VARUNA_TEST_DATABASE_URL=postgresql+psycopg://varuna:varuna@localhost:5432/varuna_netra \
VARUNA_TEST_REDIS_URL=redis://localhost:6379/0 \
  pytest ../tests/                                   # also runs the real DB/Redis/HTTP integration tests
```

The second form requires a real Postgres+PostGIS instance (the
docker-compose `postgres` service, or a local install) and a real Celery
worker running against a real Redis (`celery -A app.jobs.celery_app worker
--loglevel=INFO`). Without these two environment variables set, those
tests **skip cleanly** — the standard suite never silently depends on
external infrastructure being present.

### 6. A real investigation, end to end

```bash
# 1. Create an incident
curl -X POST localhost:8000/api/incidents -d '{"name":"...", "minlon":68,"minlat":21,"maxlon":70,"maxlat":23}'

# 2. Search for a real Sentinel-1 scene
curl "localhost:8000/api/scenes/search?minlon=68&minlat=21&maxlon=70&maxlat=23&start=2026-03-01T00:00:00Z&end=2026-03-15T00:00:00Z"

# 3. Run detection (downloads + unpacks + processes the scene)
curl -X POST localhost:8000/api/detection/run -d '{"incident_id":"...", "product_id":"...", ...}'
python -m scripts.prepare_scene --product-id <id>     # after the first call's 404, per its own message
curl -X POST localhost:8000/api/detection/run -d '{...}'   # second call actually processes it

# 4. Backward reconstruction
curl -X POST localhost:8000/api/drift/backward -d '{"incident_id":"...", "slick_geometry":{...}, "observation_time":"..."}'

# 5. AIS correlation
curl "localhost:8000/api/vessels/candidates?analysis_id=..."

# 6. PASHA + falsification + decision
curl -X POST localhost:8000/api/pasha/run -d '{"analysis_id":"...", "candidates":[...], "observed_slick_geometry":{...}}'

# 7. Evidence report
curl -X POST localhost:8000/api/reports/<incident_id>/generate -d '{"pasha_run_id":"...", "observed_slick_geometry":{...}}'
```

Or submit the whole chain as one background job and watch it progress in
real time:

```bash
curl -X POST localhost:8000/api/investigations -d '{...}'          # returns a task_id
curl -N localhost:8000/api/investigations/<task_id>/events         # SSE stream of real progress
```

---

## What is actually verified

This matters more than any other section of this README. Read
`PHASE_STATUS.md` for the full detail; the summary:

**Proven with real external infrastructure, in this development sandbox:**
- A real local PostgreSQL 16 + PostGIS 3.4 database — schema migrated,
  geometries round-tripped exactly, a full Vessel→Candidate→PashaRun→
  FalsificationResult chain persisted and re-read correctly.
- A real local Redis + Celery worker — genuinely progressive task state
  confirmed over genuinely elapsed wall-clock time, both via CLI and via
  the actual HTTP SSE endpoint.
- A real WeasyPrint PDF pipeline — output confirmed to be a valid PDF
  (`%PDF-` magic bytes), not just "didn't raise an exception."
- Real OpenDrift physics — forward advection matched a hand-computed
  analytic displacement to five significant figures; backward advection
  recovered a known synthetic release point to within metres.

**Proven with synthetic scientific-validation fixtures** (the standard,
correct way to test a numerical pipeline's *logic*, per spec section 23):
CFAR detection recovering a known embedded dark ellipse; backward
reconstruction recovering a known release point/time via KDE; M4 scoring
correctly ranking a true-source vessel above a decoy; PASHA + falsification
correctly passing the true source and rejecting the decoy; and — the
single most important test in this repository — the decision engine
returning **H0_UNKNOWN_SOURCE**, not a forced winner, when no true source
vessel exists in the candidate pool at all.

**Not verified — no path to verify from this development environment:**
- Live calls to Copernicus Data Space Ecosystem, Copernicus Climate Data
  Store, Copernicus Marine Service, or Global Fishing Watch. All four
  providers are implemented against each service's real, documented API
  shape, but none has been exercised against the live endpoint. Each
  provider's module docstring says exactly what to re-check first.
- A real Sentinel-1 GRD scene. All SAR calibration/geocoding math is
  validated against a synthetic fixture; the SAFE-file parsing logic
  (`detection/annotation.py`, `detection/pipeline.py`) has never touched
  an actual product.
- The persisted-but-not-yet-rewired parts: as of the last build session,
  every API endpoint writes real PostGIS rows (Phase 17 is complete), but
  no frontend exists yet to drive any of this through anything other than
  direct HTTP calls.

---

## Production-ready vs. prototype-grade, by component

| Component | Status |
|---|---|
| Provider auth/error-handling (all 4) | Production-grade pattern (real OAuth2/API clients, correct `ProviderNotConfigured`/`ProviderUnavailable` semantics); untested against live endpoints |
| SAR calibration/geocoding | Correct algorithm, approximate geocoding (no DEM terrain correction) — fine over open water, wrong over relief |
| M1 CFAR detection | Deterministic baseline only; window-size-vs-target-size limitation is real and documented, not fixed. No trained ML model (`ml/models/README.md` specifies the slot) |
| M2/M3 OpenDrift | Production-grade — real library, real physics, verified against hand-computed physics |
| M4 AIS correlation | Real GFW integration pattern; endpoint shapes unverified against live API |
| M5 PASHA + falsification | Production-grade — real replay, real falsification gate, and a real mass-balance physical-plausibility check (Bonn Agreement thickness range vs. vessel-type capacity ceiling); deliberately permissive margin is a documented, not hidden, limitation |
| M6 evidence dossier | Production-grade — real PDF, all spec sections, all disclaimers |
| Persistence (PostGIS) | Production-grade — real schema, real migrations, all 5 pipeline endpoints wired, plus 4 real list endpoints (incidents/scenes/vessels/reports) |
| Async orchestration (Celery/Redis/SSE) | Production-grade — verified with real infrastructure |
| Frontend | Real Vite/React/TypeScript/Tailwind/MapLibre dashboard, all 6 spec pages implemented with real data (no stubs remaining); untested as a combined `docker compose` service alongside the backend |
| Object storage (S3/MinIO) for PDFs/scenes | Not built — files currently live under `/tmp` |

---

## Scientific assumptions and limitations

- Backward Lagrangian reconstruction assumes the release-time window is
  supplied externally (from M1's slick-age estimate or analyst judgement),
  not derived from the backward ensemble's own particle spread — spread
  grows with elapsed simulation time in either direction regardless of
  where the true release was, so "minimum spread" is not a valid signal on
  its own (`drift/origin_probability.py` docstring has the full argument).
- CFAR detection's guard/window parameters must exceed the physical size
  of the target or the background ring samples the target's own interior.
- Geocoding ignores terrain (correct assumption for this system's actual
  operating domain — open water).
- AIS gaps and slow-steaming are supporting evidence only, never
  sufficient alone to pass or fail a candidate.
- This pipeline never forces an attribution. H0 is a valid, expected,
  and — per the spec — mandatory outcome when the evidence doesn't support
  naming a source.

## Legal and scientific disclaimers (reproduced from every generated report)

- Attribution status is an analytical assessment, not a legal verdict.
- Physical consistency does not establish criminal responsibility.
- AIS absence does not prove vessel involvement.
- Satellite dark features may have non-oil look-alikes.
- Model uncertainty can limit discrimination between closely spaced
  candidate sources.
