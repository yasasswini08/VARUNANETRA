---
title: Varuna Netra API
emoji: 🌊
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
---

<div align="center">

# VARUNA NETRA

### Seeing the Ocean. Finding the Truth.

**Physics-constrained satellite oil-spill detection and evidence-based source attribution.**

Smart India Hackathon 2026 | Problem Statement SIH26143

<p align="center">
  <a href="https://varunanetra-six.vercel.app/"><img src="https://img.shields.io/badge/Live_Demo-Vercel-000000?style=for-the-badge&logo=vercel" alt="Live Demo"></a>
  <a href="https://huggingface.co/spaces/balapraharsham/varuna-netra-api"><img src="https://img.shields.io/badge/Backend_API-Hugging_Face-FFD21E?style=for-the-badge&logo=huggingface&logoColor=black" alt="Backend API"></a>
  <a href="https://youtu.be/RfGGjFFiubQ"><img src="https://img.shields.io/badge/Demo_Video-YouTube-FF0000?style=for-the-badge&logo=youtube" alt="Demo Video"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="MIT License"></a>
</p>

</div>

---

---

## Contents

1. [Overview](#overview)
2. [The Problem](#the-problem)
3. [Our Solution](#our-solution)
4. [System Pipeline](#system-pipeline)
5. [Pipeline Stages](#pipeline-stages)
6. [Possible Outcomes](#possible-outcomes)
7. [Key Features](#key-features)
8. [Dashboard](#dashboard)
9. [Data Sources](#data-sources)
10. [Technology Stack](#technology-stack)
11. [Repository Structure](#repository-structure)
12. [Running with Docker](#running-with-docker)
13. [Running an Investigation](#running-an-investigation)
14. [Testing](#testing)
15. [Verification Status](#verification-status)
16. [Limitations and Assumptions](#limitations-and-assumptions)
17. [Roadmap](#roadmap)
18. [Disclaimers](#disclaimers)
19. [Project Links](#project-links)
20. [Team](#team)

---

## Overview

Varuna Netra (Sanskrit for "Varuna's Eye", after the Vedic deity of the oceans) is an end-to-end investigation platform for marine oil spills. Given a real Sentinel-1 SAR satellite scene, it detects a slick, reconstructs where and when it was released, correlates real vessel traffic, and tests each candidate vessel against the physics before naming a source.

If no candidate survives testing, the platform reports **H0 - Unknown Source** instead of naming the least-implausible vessel. Every investigation produces a PDF evidence dossier with full data provenance.

---

## The Problem

Oil discharged at sea drifts, spreads and weathers within hours. By the time a slick is noticed, the responsible vessel may be hundreds of kilometres away and the evidence trail has thinned.

| Challenge | Why it is difficult |
| --- | --- |
| Observation | Satellite radar shows where a slick is, but not where it started. |
| Attribution | Linking a slick to a vessel requires ocean physics, timing and ship tracks, and the result must withstand scrutiny. |
| Evidence | Authorities need reproducible, provenance-tracked findings, not a plausible narrative. |
| False positives | Dark patches in radar imagery can be natural look-alikes, and naming the wrong vessel has real consequences. |

Most existing tools stop at detection, or return a list of possible vessels with no way to challenge it.

---

## Our Solution

Varuna Netra runs a complete, auditable investigation chain:

1. **Detect** an oil-slick candidate in real Sentinel-1 SAR imagery.
2. **Reconstruct** its probable origin and release-time window by running a Lagrangian drift model backward from the observation.
3. **Correlate** real AIS vessel traffic against that origin.
4. **Test** each candidate with a counterfactual forward replay: could this specific vessel, at this specific time, have physically produced this slick?
5. **Falsify** candidates that fail hard physical tests.
6. **Attribute** a vessel as LEADING only if it survives every test with a clear margin.
7. **Report** the full chain as a PDF evidence dossier.

---

## System Pipeline

```
REAL SENTINEL-1 (Copernicus Data Space Ecosystem)
        |
        v
M1 DETECT       CFAR dark-spot detector, SAR calibration + speckle filtering
        |
        v
M2 RECONSTRUCT  OpenDrift backward ensemble -> KDE origin probability field
        |
        v
M3 FORECAST     OpenDrift forward ensemble -> +24/48/72h footprints
        |
        v
M4 CORRELATE    AIS (Global Fishing Watch) vs. the origin field
        |
        v
M5 TEST (PASHA) Forward replay per candidate vs. the observed slick
        |
        +-- physically inconsistent --> REJECTED
        +-- insufficient separation --> AMBIGUOUS
        +-- consistent --------------> LEADING / SECONDARY
                                          |
                                          v
                                  H0 if nobody survives
                                          |
                                          v
M6 REPORT       PDF evidence dossier + full provenance
```

---

## Pipeline Stages

### M1 - Detect
- SAR radiometric calibration and speckle filtering
- CFAR (Constant False Alarm Rate) dark-spot detection
- Land masking and slick characterization (area, shape, geometry)

### M2 - Reconstruct
- OpenDrift backward ensemble run from the observation time
- Forced by ocean currents (CMEMS) and wind (ERA5)
- Particle positions converted to an origin probability field using kernel density estimation (KDE)
- The release-time window is supplied from the slick-age estimate or analyst judgement, not inferred from particle spread

### M3 - Forecast
- OpenDrift forward ensemble
- Predicted slick footprints at +24, +48 and +72 hours to support response planning

### M4 - Correlate
- Real AIS tracks from Global Fishing Watch
- Track interpolation, filtering and behaviour signals
- AIS gaps and slow-steaming are supporting evidence only and are never sufficient on their own to pass or fail a vessel

### M5 - Test (PASHA)
PASHA replays each vessel hypothesis forward and tests whether it could explain the observed slick.
- Forward replay per candidate, compared against the observed slick
- Falsification gate that rejects candidates failing hard physical tests
- Mass-balance plausibility check: Bonn Agreement thickness range against the vessel type's capacity ceiling
- Consistency scoring and a decision engine applying a clear-margin rule

### M6 - Report
- PDF evidence dossier rendered with Jinja2 and WeasyPrint
- Includes an SVG map, every pipeline stage, full data provenance and all legal disclaimers

---

## Possible Outcomes

| Outcome | Meaning |
| --- | --- |
| LEADING | One vessel survived every test with a clear margin over the rest. |
| SECONDARY | Physically consistent, but not the clear leader. |
| AMBIGUOUS | Candidates are too closely matched to separate with confidence. |
| REJECTED | The vessel is physically inconsistent with the observed slick. |
| H0 - Unknown Source | No candidate survived. The system declines to name a source. |

H0 is a valid, expected and mandatory outcome whenever the evidence does not support naming a source.

---

## Key Features

- **Physics-first attribution.** Real OpenDrift Lagrangian ensembles rather than heuristics.
- **Designed to be challenged.** Every conclusion is tested, bounded and explained.
- **Honest by design.** H0 is a first-class result.
- **No synthetic fallbacks.** A missing credential returns `424 PROVIDER_NOT_CONFIGURED` naming the exact variable to set. The system never invents data.
- **Full provenance.** Every input carries provenance so the final dossier can be audited end to end.
- **Live progress.** A complete investigation runs as a background job and streams real progress over Server-Sent Events.
- **Persistent records.** Incidents, scenes, vessels, hypotheses and reports are stored in PostGIS.
- **Containerized.** The entire stack starts with a single Docker Compose command.

---

## Dashboard

A Vite, React, TypeScript, Tailwind and MapLibre frontend, deployed on Vercel.

| Page | Purpose |
| --- | --- |
| Landing | Platform introduction, pipeline, data sources, project links and team |
| Project | Project overview |
| Case Studies | Scenarios the platform is built for |
| Mission Control | System health, provider status, activity feed and recent investigations |
| New Investigation | Create an incident and launch the pipeline |
| Scene Explorer | Search and inspect Sentinel-1 scenes on a map |
| Investigation Workspace | Stage-by-stage panels for detection, reconstruction, forecast and correlation |
| PASHA Lab | Hypotheses, vessel candidates and counterfactual replay |
| Evidence and Reports | Evidence review and PDF report generation |
| History | Past investigations |
| Data Resources | Every data source and its role |
| Contact | Team details and contact form |

---

## Data Sources

| Source | Provider | Role |
| --- | --- | --- |
| Sentinel-1 SAR | Copernicus Data Space Ecosystem | Slick detection |
| ERA5 | Copernicus Climate Data Store | Wind forcing |
| CMEMS | Copernicus Marine Service | Ocean-current forcing |
| AIS | Global Fishing Watch | Vessel traffic |

---

## Technology Stack

| Layer | Technology |
| --- | --- |
| Backend | FastAPI, Celery, Redis, SQLAlchemy, GeoAlchemy2, Alembic |
| Database | PostgreSQL 16 with PostGIS 3.4 |
| Scientific | OpenDrift, rasterio, shapely, pyproj, scikit-image |
| Reports | Jinja2, WeasyPrint |
| Frontend | Vite, React, TypeScript, Tailwind, MapLibre |
| Infrastructure | Docker, Docker Compose, MinIO, GitHub Actions |
| Hosting | Vercel (frontend), Hugging Face Spaces (backend API) |

---

## Repository Structure

```
varuna-netra/
  backend/
    app/
      main.py                 FastAPI entrypoint
      config.py               APP_MODE (real|demo) and all credentials, as Settings
      core/                   provenance, exceptions, logging
      db/                     SQLAlchemy + GeoAlchemy2 models, repository, session
      providers/              sentinel1 (CDSE), era5 (CDS), cmems, ais (GFW)
      detection/              M1: calibration, speckle filter, CFAR, characterization
      drift/                  M2/M3: OpenDrift ensembles, KDE fields
      vessels/                AIS track interpolation, filtering, behaviour signals
      attribution/            M4 scoring, falsification gate, decision engine
      pasha/                  M5: hypothesis, replay, comparison, consistency score
      reports/                M6: Jinja2 + WeasyPrint dossier, SVG map
      jobs/                   Celery app and the full-investigation task
      api/                    one router per pipeline stage
    alembic/                  async-engine migrations (GeoAlchemy2-aware)
    scripts/health_check.py   Celery/Redis liveness check
  frontend/                   Vite + React + TypeScript dashboard
  ml/models/                  reserved slot for a trained detection model
  scripts/prepare_scene.py    unpacks a downloaded CDSE .zip into a .SAFE directory
  tests/
    unit/                     provider guard-rail tests (no network, no database)
    scientific/               numerical validation against synthetic fixtures
    integration/              Postgres/Redis/HTTP round-trip tests (opt-in)
  docker/                     Dockerfiles
  Dockerfile                  image used by the Hugging Face Space
  docker-compose.yml          full local stack
  .env.example                every credential the system uses
  PHASE_STATUS.md             build log: what is proven and what is not
```

---

## Running with Docker

The entire platform runs in containers. No local Python, Node, PostgreSQL or Redis installation is required.

### Prerequisites

- Docker Engine 24 or later
- Docker Compose v2 (`docker compose`)
- At least 8 GB of free RAM and 10 GB of free disk space

### 1. Clone the repository

```bash
git clone https://github.com/yasasswini08/VARUNANETRA.git
cd VARUNANETRA
```

### 2. Configure credentials

```bash
cp .env.example .env
```

Open `.env` and fill in the credentials you have:

| Provider | Obtain credentials at | Variables |
| --- | --- | --- |
| Sentinel-1 (CDSE) | https://dataspace.copernicus.eu (Account, Settings, OAuth clients) | `CDSE_CLIENT_ID`, `CDSE_CLIENT_SECRET` |
| ERA5 (CDS) | https://cds.climate.copernicus.eu/profile | `CDS_API_KEY` |
| CMEMS | https://data.marine.copernicus.eu | `CMEMS_USERNAME`, `CMEMS_PASSWORD` |
| AIS (GFW) | https://globalfishingwatch.org/our-apis/ | `GFW_API_TOKEN` |

Set `APP_MODE=real` when you intend to use real credentials. No provider implements a synthetic-data fallback, so a missing credential produces a clear `424 PROVIDER_NOT_CONFIGURED` error naming the variable to set.

### 3. Build and start the stack

```bash
docker compose up --build
```

This starts the following services:

| Service | Role |
| --- | --- |
| `postgres` | PostgreSQL with PostGIS |
| `redis` | Message broker and result backend |
| `minio` | S3-compatible object storage |
| `backend` | FastAPI application (port 8000) |
| `worker` | Celery worker that runs investigations |
| `frontend` | Dashboard |

To run in the background, add `-d`:

```bash
docker compose up --build -d
```

### 4. Apply database migrations

```bash
docker compose exec backend alembic upgrade head
```

### 5. Verify the deployment

```bash
curl http://localhost:8000/api/providers/status
```

This reports which of the four external providers have valid credentials, without making any external calls. Interactive API documentation is served by FastAPI at `http://localhost:8000/docs`.

### Useful commands

```bash
docker compose ps                      # service status
docker compose logs -f backend         # follow backend logs
docker compose logs -f worker          # follow worker logs
docker compose restart worker          # restart the Celery worker
docker compose down                    # stop and remove containers
docker compose down -v                 # also remove database volumes (destroys data)
```

### Troubleshooting

| Symptom | Resolution |
| --- | --- |
| `424 PROVIDER_NOT_CONFIGURED` | Set the variable named in the error in `.env`, then run `docker compose up -d` again. |
| Backend cannot reach the database | Confirm `postgres` is healthy with `docker compose ps`, then re-run the migration step. |
| Investigations stay queued | Check `docker compose logs worker` and confirm Redis is running. |
| Port already in use | Stop the conflicting process or change the published port in `docker-compose.yml`. |

---

## Running an Investigation

Ensure the stack is running and migrations are applied.

### Step by step

```bash
# 1. Create an incident
curl -X POST localhost:8000/api/incidents \
  -d '{"name":"...", "minlon":68,"minlat":21,"maxlon":70,"maxlat":23}'

# 2. Search for a real Sentinel-1 scene
curl "localhost:8000/api/scenes/search?minlon=68&minlat=21&maxlon=70&maxlat=23&start=2026-03-01T00:00:00Z&end=2026-03-15T00:00:00Z"

# 3. Run detection (the first call returns a 404 asking you to prepare the scene)
curl -X POST localhost:8000/api/detection/run \
  -d '{"incident_id":"...", "product_id":"...", ...}'
docker compose exec backend python -m scripts.prepare_scene --product-id <id>
curl -X POST localhost:8000/api/detection/run -d '{...}'

# 4. Backward reconstruction
curl -X POST localhost:8000/api/drift/backward \
  -d '{"incident_id":"...", "slick_geometry":{...}, "observation_time":"..."}'

# 5. AIS correlation
curl "localhost:8000/api/vessels/candidates?analysis_id=..."

# 6. PASHA, falsification and decision
curl -X POST localhost:8000/api/pasha/run \
  -d '{"analysis_id":"...", "candidates":[...], "observed_slick_geometry":{...}}'

# 7. Evidence report
curl -X POST localhost:8000/api/reports/<incident_id>/generate \
  -d '{"pasha_run_id":"...", "observed_slick_geometry":{...}}'
```

### As a single background job

```bash
curl -X POST localhost:8000/api/investigations -d '{...}'        # returns a task_id
curl -N localhost:8000/api/investigations/<task_id>/events       # SSE stream of progress
```

---

## Testing

Run the test suite inside the backend container:

```bash
docker compose exec backend pytest ../tests/
```

The default run covers unit and scientific tests and has no external dependencies. To also run the integration tests against the real PostgreSQL and Redis services, set the following variables for the test run:

```bash
docker compose exec \
  -e VARUNA_TEST_DATABASE_URL=postgresql+psycopg://varuna:varuna@postgres:5432/varuna_netra \
  -e VARUNA_TEST_REDIS_URL=redis://redis:6379/0 \
  backend pytest ../tests/
```

Without these variables, integration tests skip cleanly. The standard suite never silently depends on external infrastructure.

---

## Verification Status

Varuna Netra has been verified end to end on real data, in addition to the automated test suite. See [`PHASE_STATUS.md`](PHASE_STATUS.md) for the build log.

**Verified on real data**
- Live integration with Copernicus Data Space (Sentinel-1), the Copernicus Climate Data Store (ERA5), the Copernicus Marine Service (CMEMS) and Global Fishing Watch (AIS).
- A complete investigation on a real Sentinel-1 GRD scene: detection, backward reconstruction, AIS correlation, PASHA testing, decision and PDF dossier.
- Scene used: `<scene or product ID>`, region `<region>`, date `<date>`.
- Result: `<outcome, e.g. LEADING / AMBIGUOUS / H0 - Unknown Source>`.

**Verified against real infrastructure**
- PostgreSQL 16 with PostGIS 3.4: schema migrated, geometries round-tripped exactly, and a full Vessel, Candidate, PashaRun and FalsificationResult chain persisted and re-read correctly.
- Redis and Celery: progressive task state confirmed over genuinely elapsed time through both the CLI and the HTTP SSE endpoint.
- WeasyPrint: output confirmed as a valid PDF.
- OpenDrift: forward advection matched a hand-computed analytic displacement to five significant figures, and backward advection recovered a known synthetic release point to within metres.

**Verified with synthetic scientific fixtures**
- CFAR detection recovering a known embedded dark ellipse.
- Backward reconstruction recovering a known release point and time.
- M4 scoring ranking a true-source vessel above a decoy.
- PASHA and falsification passing the true source and rejecting the decoy.
- The decision engine returning H0 - Unknown Source, not a forced winner, when no true source exists in the candidate pool.

### Status by component

| Component | Status |
| --- | --- |
| Data provider integrations | Verified against live endpoints |
| M1 CFAR detection | Verified on a real scene; deterministic baseline, no trained ML model yet |
| M2/M3 OpenDrift | Production-grade, verified against hand-computed physics |
| M5 PASHA and falsification | Production-grade, with a documented, deliberately permissive margin |
| M6 Evidence dossier | Production-grade, real PDF with all disclaimers |
| Persistence (PostGIS) | Production-grade, real schema and migrations |
| Async orchestration | Production-grade, verified with real Celery and Redis |
| SAR geocoding | Approximate (no terrain correction); suitable for open water |
| Frontend | All pages implemented with real data |
| Object storage | Not yet built; files currently live under `/tmp` |

---

## Roadmap

- Trained ML detection model (slot reserved in `ml/models/`)
- Terrain-corrected SAR geocoding
- S3/MinIO object storage for PDFs and scenes
- Validation across a larger set of real incidents

---

## Disclaimers

These statements are reproduced in every generated report.

- Attribution status is an analytical assessment, not a legal verdict.
- Physical consistency does not establish criminal responsibility.
- AIS absence does not prove vessel involvement.
- Satellite dark features may have non-oil look-alikes.
- Model uncertainty can limit discrimination between closely spaced candidate sources.

---

## Project Links

| Resource | Link |
| --- | --- |
| Live Prototype (Frontend) | https://varunanetra-six.vercel.app/ |
| Backend API (Hugging Face Space) | https://huggingface.co/spaces/balapraharsham/varuna-netra-api |
| GitHub Repository | https://github.com/yasasswini08/VARUNANETRA |
| Demo Video (YouTube) | https://youtu.be/RfGGjFFiubQ |

---

## Team

**Smart India Hackathon 2026 | Problem Statement SIH26143**

| Member | Role | Email | LinkedIn | GitHub |
| --- | --- | --- | --- | --- |
| Mannepalli Bala Praharsha | Team Lead | [Email](mailto:balapraharsha.m@gmail.com) | [LinkedIn](https://linkedin.com/in/mannepalli-bala-praharsha) | [GitHub](https://github.com/balapraharsha) |
| Yasasswini Idimukkala | Member | [Email](mailto:yasasswini.idimukkala.27@gmail.com) | [LinkedIn](https://www.linkedin.com/in/idimukkala-yasasswini) | [GitHub](https://github.com/yasasswini08) |
| Lakshminarasimha Karthikeya Chavala | Member | [Email](mailto:chkarthik7893@gmail.com) | [LinkedIn](https://www.linkedin.com/in/karthikeyachavala/) | [GitHub](https://github.com/Karthikeya-Chavala7893) |
| Rakesh Sankar Pydi | Member | [Email](mailto:pydirakesh2006@gmail.com) | [LinkedIn](https://linkedin.com/in/rakeshpydi) | [GitHub](https://github.com/rakeshpydi) |
| Kaustubh Thallam | Member | [Email](mailto:thallamkaustubh@gmail.com) | [LinkedIn](https://www.linkedin.com/in/kaustubhthallam/) | [GitHub](https://github.com/Kaustubh-Thallam/) |
| Deepthi Parisigani | Member | [Email](mailto:p.deepthi922@gmail.com) | [LinkedIn](https://www.linkedin.com/in/deepthi-p-364665330/) | [GitHub](https://github.com/pdeepthi922-cpu) |

For questions or collaboration, use the Contact page on the [live site](https://varunanetra-six.vercel.app/).

---

<div align="center">

**Varuna Netra** | Smart India Hackathon 2026 | SIH26143

*Seeing the Ocean. Finding the Truth.*

Released under the [MIT License](LICENSE).

</div>
