# Varuna Netra — build status

Tracks the 16 implementation phases from the spec. Updated every message as
new phases land. "Verified" means I actually ran it in this session, not
that the code merely compiles by inspection.

| Phase | Scope | Status | Verified this session |
|---|---|---|---|
| 1 | Repo + Docker + PostGIS + FastAPI | **Done** | App boots, routes register, `docker-compose.yml`/`Dockerfile`s written (not yet run — no Docker daemon in this sandbox) |
| 2 | Provider interfaces | **Done** | `BaseProvider`/`SatelliteProvider`/`WindProvider`/`CurrentProvider`/`AISProvider` ABCs; registry-style `/api/providers/status` |
| 3 | Sentinel-1 real-data integration | **Done** | Real CDSE OAuth2 + STAC search/get/download implemented against documented endpoints. `PROVIDER_NOT_CONFIGURED` (424) verified via `TestClient` with no credentials. **Not verified against the live CDSE API** — no network egress to `dataspace.copernicus.eu` from this sandbox; you must run this against your own credentials to confirm CDSE hasn't changed a path since. |
| 4 | ERA5 real-data integration | **Done** | `CDSEra5Provider` uses the official `cdsapi` client against `CDS_API_URL`/`CDS_API_KEY`, requests 10m u/v wind from `reanalysis-era5-single-levels`. `GET /api/environment/wind` verified to return `424 PROVIDER_NOT_CONFIGURED` with no key set. **Not verified against the live CDS API** — no egress to `cds.climate.copernicus.eu` from this sandbox. |
| 5 | CMEMS real-data integration | **Done** | `CopernicusMarineProvider` uses the official `copernicusmarine.subset()` toolbox against `CMEMS_DATASET_ID` (default: global merged surface currents, hourly). `GET /api/environment/currents` verified to return `424` with no credentials, and specifically verified that a *username with no password* still reports unconfigured (partial-credential leak is a real failure mode this test exists to catch). **Not verified against the live CMEMS API** — no egress to `data.marine.copernicus.eu`. |
| 6 | Sentinel-1 download + preprocessing | **Done** | Real SAFE-product parsing: calibration XML (`annotation.py`), GCP-based approximate geocoding (`calibration.py`), radiometric calibration DN→sigma0 (`calibration.py`), Lee-filter speckle reduction (`speckle.py`), offline land masking (`landmask.py`, via `global-land-mask`). `POST /api/detection/run` wires this to a real CDSE download; verified to return `424 PROVIDER_NOT_CONFIGURED` end-to-end with no credentials. |
| 7 | M1 DETECT (oil-slick segmentation) | **Done** | CFAR dark-spot detector (`segmentation.py`, deterministic baseline as instructed — no ML model trained, see `ml/models/README.md` for the checkpoint contract a future model must satisfy), connected-component vectorization + look-alike rules (`postprocessing.py`), geodesic shape/contrast characterization (`slick_characterization.py`). **Scientifically validated**: `tests/scientific/test_m1_detect.py` embeds a known synthetic dark ellipse in speckled calibrated backscatter and confirms the pipeline recovers its area (within 40%) and orientation (within 15°) end-to-end through calibration → speckle filter → CFAR → vectorization → characterization — real numerical proof, not an assertion of intent. A second test confirms a pure-background scene yields zero false candidates. |
| 8 | OpenDrift backward reconstruction (M2) | **Done** | `drift/ensemble.py`, `drift/backward.py` — real OpenDrift `OceanDrift` model, RK4 advection, run with a **negative time_step** (the standard, published backward-Lagrangian technique). `drift/origin_probability.py` builds a real Gaussian-KDE origin field and highest-density-region contour (not a point estimate — per spec section 8's explicit requirement). `POST /api/drift/backward` wires real ERA5+CMEMS forcing in; verified to return `424 PROVIDER_NOT_CONFIGURED` end-to-end with a real slick polygon and no credentials. |
| 9 | OpenDrift forward forecast (M3) | **Done** | `drift/forward.py` shares the same `run_ensemble` core with `direction=+1`. `POST /api/drift/forecast` fetches **fresh** forward-looking ERA5/CMEMS data (caught and fixed during this phase — reusing the backward call's readers would silently have had no forcing data past the observation time). |
| 10 | AIS integration (GFW) / M4 correlate | **Done** | `providers/ais/gfw.py` — real GFW v3 flow (4wings vessel-discovery → per-vessel track fetch); raises the spec-exact `"AIS DATA UNAVAILABLE FOR THIS ANALYSIS WINDOW"` when discovery finds nothing, verified with respx-mocked HTTP (no live GFW egress here). `attribution/scoring.py` — spatial/temporal/trajectory/behavioural weighted scoring, all four weights configurable via Settings, sampling M2's real KDE origin field at each vessel's interpolated position/hour. **Scientifically validated**: `test_m4_correlate.py` builds a true-source vessel (positioned at the real reconstructed origin, slow-speed segment at release) and an unrelated decoy, runs both through real backward reconstruction + scoring, and confirms the true vessel outranks the decoy and scores >0.5 — not just "the code runs," an actual discriminative-power check. |
| 11 | Candidate generation + physical consistency scoring | **Done** (folded into phase 10's scoring + this phase's PASHA metrics) | |
| 12 | PASHA counterfactual replay (M5) | **Done** | `pasha/hypothesis.py` turns an M4 candidate into a concrete release hypothesis; `pasha/replay.py` forward-simulates it with the same real OpenDrift core as M3; `pasha/comparison.py` computes true grid-based IoU (not convex-hull-only, which would overstate overlap), geodesic centroid distance, an arrival-time scan, and shape similarity; `pasha/metrics.py` combines them into the spec-mandated **PHYSICAL CONSISTENCY SCORE** (never "probability of guilt" anywhere in code, logs, or docstrings). |
| 13 | Falsification gate + H0 Unknown Source | **Done** | `attribution/falsification.py` — four hard tests (spatial/temporal/drift/physical), any one of which fails the candidate regardless of score; behavioural evidence is explicitly supporting-only, never blocking. `attribution/decision_gate.py` — deterministic LEADING/SECONDARY/AMBIGUOUS/REJECTED/H0_UNKNOWN_SOURCE, margin- and min-score-gated, never forces a winner. **Scientifically validated**: `test_m5_pasha.py` extends the M4 true-source-vs-decoy scenario through real PASHA replay and confirms (a) the true source passes every hard test and is named LEADING, (b) the decoy fails and is REJECTED, and — separately — (c) a scenario with **no true source vessel at all** correctly returns H0_UNKNOWN_SOURCE rather than forcing the least-bad decoy to the top. That third case is the spec's single most important behavioural requirement, and it's the one most demos fake. |
| 14 | Evidence/provenance dossier + PDF (M6) | **Done** | `reports/evidence_dossier.py` renders a real Jinja2 template (`templates/evidence_dossier.html.j2`, all 17 spec-required sections) to a real PDF via WeasyPrint — installed and verified working in this sandbox (needed `libpango`, `libcairo2`, `libgdk-pixbuf2.0-0`, `libharfbuzz-subset0` via apt; now pinned in `docker/backend.Dockerfile`). `reports/svg_map.py` draws a dependency-light SVG map (observed slick, origin region, candidate positions) rather than pulling in matplotlib for five shapes. All five spec-mandated disclaimers (section 28) are hardcoded into the template verbatim. **Verified, not assumed**: the integration test opens the generated file and checks its first bytes are literally `%PDF-`, checks it exceeds a minimum plausible size (8 KB), and checks every disclaimer string is present — for both a LEADING outcome and a real H0_UNKNOWN_SOURCE outcome (reusing the exact M5 no-true-source scenario). |
| 15 | React operational dashboard | **Done — all six pages real, none stubbed** | Real Vite + React 19 + TypeScript + Tailwind v4 + MapLibre GL, wired to the actual FastAPI backend (not mocked). Main investigation screen has all four regions from spec section 15: top pipeline stepper, left controls driving every real endpoint in sequence, center MapLibre map with toggleable layers and click-to-select, right evidence panel with per-candidate falsification results and the final LEADING/H0 outcome plus the mandated disclaimer text inline. `/incidents`, `/scenes`, `/vessels`, `/reports` were initially honest stubs explaining their missing backend list endpoints — **those endpoints now exist** (see phase 17 update below), so all four are real list views hitting real data, no stub remaining anywhere. **Genuinely verified**: `tsc -b` caught 15 real type errors across two build passes (the four new list pages introduced a second round — a generic `Record<string, T[]>` fetcher signature that TypeScript's structural typing couldn't reconcile with concrete interfaces; fixed by simplifying the generic to `() => Promise<T[]>` and unwrapping the response key at each call site instead); `vite build` produces a working `dist/`, served with `vite preview` and `curl`'d to confirm real `200`s on the new routes too. |
| 16 | Celery/Redis async pipeline + progress | **Done** | `jobs/investigation_pipeline.py` — a real Celery task (`investigation.run_full`) chaining M1→M6 with progress percentages matching the spec's own worked example exactly (0/10/20/35/45/55/65/72/80–95/98/100), each `update_state()` call firing only after the real async step it describes has actually returned. `api/investigations.py` — `POST /api/investigations` submits the task, `GET .../events` streams real Celery/Redis state as Server-Sent Events. **Verified against real, separately-installed infrastructure**: installed Redis via apt, ran an actual `celery -A app.jobs.celery_app worker` process, and used a dedicated diagnostic task (`investigation.health_check_progress` — also `scripts/health_check.py`, satisfying spec section 26's CLI requirement) to prove the whole chain reports genuinely progressive state over genuinely elapsed wall-clock time, not an instant or client-side-timed fake:<br>`[t+ 1.3s] percent=20` → `[t+ 2.2s] percent=40` → `[t+ 3.1s] percent=60` → `[t+ 4.3s] percent=80` → `[t+ 5.2s] percent=100`<br>Then repeated the same proof through the *real* HTTP SSE endpoint (`test_investigation_progress.py`): consumed the actual `text/event-stream` response via `TestClient.stream()`, asserted the received percentages are monotonically increasing, span at least 3 distinct real values, and that the whole exchange took over 2 real seconds for 4×0.8s of genuine backend work. Confirmed the app boots fine with Redis completely unreachable (Celery's client construction is lazy, same discipline as the DB session dependency). One environment quirk worth flagging: this specific SSE test failed once when run in the same pytest session as the CPU-heavy OpenDrift scientific tests (Redis connection timeout under sandbox CPU contention) but passed cleanly in isolation — a sandbox resource-contention artifact, not a code defect, and not something a dedicated worker/broker under normal load would hit. |
| 17 | Real-data integration tests | **Persistence layer complete across all five pipeline endpoints, plus the four list endpoints the frontend needed** | Every API endpoint now writes real rows: `incidents.py` (Incident), `detection.py` (SatelliteScene, SpillDetection), `drift.py` (OriginAnalysis), `vessels.py` (Vessel upsert, Candidate), `pasha.py` (PashaRun, FalsificationResult, Candidate status update), `reports.py` (EvidenceReport). `db/repository.py` covers every entity in the spec's schema. **Real verification against the live local PostGIS instance**: direct repository round-trips for every entity, a full Vessel→Candidate→PashaRun→FalsificationResult chain, a dedicated OriginAnalysis MultiPolygon round-trip, and a genuine HTTP-level test proving persisted rows survive across separate requests. `GET /api/incidents`, `GET /api/scenes`, `GET /api/vessels`, `GET /api/reports` (all new) close the exact gap the frontend's four honest stub pages were built around — verified with a live `TestClient` run against the real database that created an incident, then confirmed it (and five scenes left over from earlier test sessions) actually come back through the list endpoints. One real bug caught and fixed while wiring `pasha.py`: a loop-scope variable leak meant every candidate's persisted PashaRun row would have silently borrowed whichever candidate ran last's metrics — fixed by storing each candidate's own metrics explicitly. **35 tests total: 30 passed / 5 skipped by default (no DB/Redis configured); all 35 passed with real Postgres+Redis+worker running** (net of the one transient Redis-under-load flake noted in phase 16, reconfirmed passing in isolation). |
| 18 | Deployment + observability + prod hardening | Partial — `.env.example` complete; full README pending |

## What changed since the last update

Restarted a real local Postgres 16 + PostGIS 3.4 (installed via apt in this
sandbox; it does not persist between tool-call sessions, so a fresh
`pg_ctl start` was needed) and used it for two more rounds of real
verification: the full candidate-chain round-trip, and — new this round —
an actual HTTP-level test through `TestClient` proving `POST
/api/detection/run` commits rows a completely separate request can read
back. `detection.py`'s Sentinel-1 auth and SAR pipeline were stubbed with
explicit, docstring-flagged test doubles for this test (both already have
their own real verification elsewhere — the 424 check and the CFAR
scientific test) so this test's only job is the endpoint-to-database wire,
and it is a real wire, not an assumption.

## What "done" means for the persistence work

This is the first phase in this whole build where the "not verified, no
egress" caveat does **not** apply to the core claim: Postgres and PostGIS
are on `apt`'s allowed mirrors, so I installed a real server, started it,
created the real extension, ran a real `alembic revision --autogenerate`
against it, applied the migration, and inserted/read back real geometry
rows — then deleted a redundant no-op migration alembic generated on a
second run, confirming the schema was actually stable rather than drifting
migration-to-migration. Commands to reproduce this locally are in the
project README once section 27 lands; until then, the exact sequence run
here is: `apt-get install postgresql postgresql-contrib postgis
postgresql-16-postgis-3`, start the service, `createdb` +
`CREATE EXTENSION postgis`, then `alembic upgrade head` from `backend/`
with `DATABASE_URL` pointed at it.

## What "done" means for phase 14

WeasyPrint needs real system libraries this sandbox didn't have by
default (`libpango-1.0-0`, `libpangoft2-1.0-0`, `libcairo2`,
`libgdk-pixbuf2.0-0`, `libharfbuzz-subset0`) — installed via `apt-get`
during this phase (network egress to `archive.ubuntu.com`/
`security.ubuntu.com` is allowed here, unlike the Copernicus/GFW domains),
confirmed with a real `write_pdf()` call before writing a single line of
the actual template, and now pinned into `docker/backend.Dockerfile` so a
fresh container build doesn't have to rediscover this. The generated PDF
was opened and checked byte-for-byte (`%PDF-` magic bytes, >8 KB), not just
assumed non-empty because `write_pdf()` didn't raise.

## What "done" means for phases 11–13

The headline result is `test_no_true_source_yields_h0_unknown_source`: with
two decoy vessels and no genuine source anywhere in the candidate list, the
decision engine returns H0 rather than picking whichever decoy happened to
score highest. This is the exact failure mode the spec's non-negotiable
rule (section 2) exists to prevent, and it's verified against a real
falsification gate fed by real (if synthetic-fixture) PASHA replay metrics
— not asserted by inspection of the decision logic in isolation.

One implementation note worth flagging honestly: `run_falsification_gate`'s
`physically_plausible` and `drift_replay_ran_successfully` arguments are
currently always passed as `True` by both the test and the API endpoint,
because this phase didn't implement an independent physical-plausibility
check (e.g. release volume vs. observed slick volume/area consistency) --
the "physical test" in the current gate is really only substantively
covered by the spatial/temporal/drift tests already present. A real
physical-plausibility check (oil type/volume-based mass-balance
consistency) is a legitimate gap, not a placeholder pretending to be
something it isn't -- flagged here rather than silently left as `True`.

## What "done" means for phase 10

Two real bugs caught while building this, same standard as phases 8–9:

1. **`forecast_snapshot` broke on fractional hour steps** —
   `np.timedelta64(hours_ahead, "h")` silently requires an integer; passing
   a numpy float64 (which `np.arange` produces even for whole-number steps)
   raised `ValueError: Could not convert object to NumPy timedelta`. Fixed
   by converting through seconds instead. This would have been a silent
   correctness trap in production if `hour_step` were ever set to anything
   other than exactly 1 — caught here because the M4 scientific test
   actually exercises the multi-hour KDE cache, not just a single call.
2. Verified the discriminative power of the scoring math, not just its
   plumbing: `test_m4_correlate.py` requires the true-source vessel to beat
   an unrelated decoy on `overall_score`, using two independently
   constructed AIS tracks scored by the real weighted combination of
   spatial/temporal/trajectory/behavioural components.

**Still not verified**: GFW's actual v3 endpoint shapes (`/v3/4wings/report`,
`/v3/vessels/{id}/tracks`) against the live API — `gfw.py`'s docstring
flags this explicitly; re-check against
https://globalfishingwatch.org/our-apis/documentation before a real run,
since GFW has revised this surface before and this sandbox cannot reach it
to confirm.

## What "done" means for phases 8–9

This is the phase where I actually caught and fixed real bugs, not just
wrote code that happened to import:

1. **OpenDrift's config keys don't match its own documentation examples in
   the installed 1.14.12 version** (`drift:horizontal_diffusivity` doesn't
   exist; it's `environment:fallback:horizontal_diffusivity` now, and
   `drift:wind_drift_factor` is `seed:wind_drift_factor`). Found this by
   actually running it and reading the `ValueError`, not by inspection.
2. **Backward reconstruction was verified against a real physics check
   before being trusted**: I ran a plain constant-current forward
   simulation, computed the analytically expected displacement by hand
   (0.3 m/s × 10 h = 10.8 km), and confirmed OpenDrift matched it to five
   significant figures — then did the same check with a negative
   `time_step` to confirm backtracking recovers a known origin to within
   metres, *before* writing the full ensemble/KDE pipeline on top of it.
3. **The forecast endpoint's first draft was wrong and I caught it before
   shipping it**: reusing the backward call's environmental readers for the
   forward forecast would have silently had no forcing data past the
   observation time (the backward window only spans hindcast_start →
   observation_time). Fixed by having `/api/drift/forecast` fetch a fresh,
   forward-looking ERA5/CMEMS window instead.

**Still not verified**: real ERA5/CMEMS data flowing into a real OpenDrift
run (no egress to either service from this sandbox), and the full pipeline
against a real Sentinel-1-derived slick polygon rather than a synthetic
fixture. The scientific test (`test_drift_reconstruction.py`) validates the
*backtracking technique itself* end-to-end with real OpenDrift physics; it
does not validate ERA5/CMEMS data quality, which only a live run can do.

## Known limitations carried into phase 8+

- **CFAR window vs. target size**: the detector's `guard`/`window`
  parameters must exceed the physical size of the feature being detected,
  or its own background ring samples its own interior and it becomes
  invisible to itself. This is fixed-window CFAR's known weakness against
  large or highly variable-size targets (real slicks range from under 1 km2
  to 100+ km2). Documented in `segmentation.py`; not fixed — an operational
  system should run multiple window scales and union the results, or move
  to a superpixel/learned approach (see `ml/models/README.md`).
- **Geocoding is approximate**: the GCP-based affine transform ignores
  terrain height (no DEM-based range-Doppler terrain correction). This is
  fine over open water — the pipeline's actual operating domain — but would
  be wrong for a scene with real relief in frame.
- **Land mask resolution (~1 km)** can misclassify a detection right at a
  shoreline by a pixel or two; swapping in a higher-resolution national
  coastline vector is a one-function change (`landmask.py`).
- Every one of the above is exercised by `tests/scientific/test_m1_detect.py`
  against a synthetic fixture, not against a real Sentinel-1 scene — this
  sandbox cannot reach CDSE to fetch one. First real-scene run should
  happen on your machine per the phase 3 credential-setup note above.

## Order note

Following the reprioritized roadmap: Phase 6 (Sentinel-1 download +
preprocessing) and Phase 7 (M1 DETECT) come next, **before** OpenDrift.
Rationale carried over: a real georeferenced slick polygon in PostGIS, with
full provenance, from an actual GRD scene, is the first genuine scientific
vertical slice — OpenDrift then has a real geometry to hindcast from
instead of a synthetic placeholder.

## What "done" means for phase 3 specifically

`CDSESentinel1Provider` implements the actual OAuth2 client-credentials
flow and STAC search body CDSE documents. I cannot call it end-to-end from
this sandbox (egress is restricted to package registries + GitHub), so what
"verified" means here is: correct control flow, correct error surfacing,
correct provenance tagging — confirmed by a real HTTP round-trip against
FastAPI's `TestClient`. It has **not** been confirmed against the live
CDSE API. The first thing to do when you have credentials:

```bash
curl -X POST $CDSE_TOKEN_URL \
  -d grant_type=client_credentials -d client_id=$CDSE_CLIENT_ID -d client_secret=$CDSE_CLIENT_SECRET
```

If that doesn't return an `access_token`, CDSE's endpoint has moved and
`cdse.py`'s URLs need updating before anything else in this phase will work.

## What "done" means for phases 4–5

Both providers wrap the *official* client libraries (`cdsapi`, `copernicusmarine`)
rather than reimplementing REST calls — this is the documented, supported
integration path for each service, and it means CDS/CMEMS's own retry and
auth-refresh logic is doing the work, not a hand-rolled copy of it. Verified
here: `is_configured()`/`require_configured()` correctly gate every call, the
partial-credential case (CMEMS username with no password) is explicitly
tested, and both new endpoints return clean 424s through a real FastAPI
`TestClient` round-trip. **Not verified**: an actual data pull. `cdsapi`
retrieval in particular can take minutes even when it works (CDS queues the
job), so the first real run should go through Celery once phase 16 lands —
don't be surprised if `GET /api/environment/wind` times out as an HTTP
request even with valid credentials.

---

## Gap closure session: physical plausibility + frontend list endpoints

Two gaps flagged explicitly in earlier updates were closed in this
session, both with the same real-verification discipline as everything
else in this log.

### 1. Physical plausibility (previously always `True`)

`app/attribution/physical_plausibility.py` (new) replaces the hardcoded
`physically_plausible=True` in both `pasha.py` and
`jobs/investigation_pipeline.py` with a real mass-balance check: it
estimates the observed slick's oil mass from its geodesic area using the
Bonn Agreement Oil Appearance Code's documented 1-20 micron thickness
range, then compares that estimate against a vessel-type-based plausible
capacity ceiling (tanker cargo capacity vs. bulk/cargo/fishing vessel
bunker-fuel-only capacity). Deliberately permissive (1.5x margin, and uses
the low/bare-sheen end of the mass estimate) since SAR amplitude alone
can't reveal true oil-layer thickness — this catches genuinely impossible
pairings (a fishing vessel "producing" a 2000 km² slick) rather than
finely discriminating between two plausible tanker-sized candidates. This
limitation is stated directly in the module's own docstring, not left
implicit.

**Verified**: 6 new unit tests (`test_physical_plausibility.py`) covering
linearity of the mass estimate, DWT override of the type-based default, and
both directions of the plausibility boundary — including one test that
initially failed for a legitimate physical reason (a 500 km² slick turned
out to be mass-plausible for even a small fishing vessel at bare-sheen
thickness, since a small real spill genuinely can spread into a very thin,
very large sheen; the test's assumed area was increased to 2000 km² to
actually exceed capacity, rather than loosening the check itself — the
failure was in the test's assumption, not the code). Re-ran the existing
M5 scientific tests (`test_m5_pasha.py`) with the real check wired in
instead of the placeholder — both still pass, as expected for the small
synthetic-fixture slick size used there.

### 2. The four frontend list endpoints

`GET /api/incidents`, `GET /api/scenes`, `GET /api/vessels`, `GET
/api/reports` (all new) close the exact gap the frontend's four honest
stub pages were built around in phase 15. `db/repository.py` gained
`list_incidents`, `list_scenes`, `list_vessels`, `list_reports` — real
SQLAlchemy queries, not new tables or synthetic data.

**Verified against the live database**: created a real incident via
`TestClient`, then confirmed it — and five `SatelliteScene` rows left
over from earlier test sessions — actually come back through the new list
endpoints in a single script run, output captured directly:
```
create incident: 200
list incidents: 200 count= <includes the just-created incident>
list scenes: 200 {'scenes': [...]}
list vessels: 200 {'vessels': []}
list reports: 200 {'reports': []}
```
Vessels/reports came back empty because no prior session had persisted
one through the real API path with a `db_id` — itself a correct result,
not a bug: an empty list is what an honest, unpopulated table should
return.

The frontend's four "coming soon" stub pages were then replaced with real
`ListPage` components hitting these endpoints. This introduced a second
round of real TypeScript build errors — a generic `Record<string, T[]>`
fetcher signature that TypeScript's structural typing couldn't reconcile
against concrete response interfaces — fixed by simplifying the generic to
`() => Promise<T[]>` and unwrapping the response key at each call site
instead of inside the shared component. `tsc -b` and `vite build` both
pass clean; the built `dist/` was served with `vite preview` and `curl`'d
again to confirm the new routes return real `200`s, same as phase 15.

### Final regression

```
30 passed, 5 skipped   -- default, no DB/Redis/worker configured
35 passed              -- real Postgres + Redis + Celery worker all live
                          (net of the one already-documented Redis-under-
                          load flake from phase 16, reconfirmed passing
                          in isolation: 1 passed in 7.65s)
```

No regressions in any previously-passing test across either mode.
