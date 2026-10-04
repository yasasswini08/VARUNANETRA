/**
 * Types mirror the real backend contracts (backend/app/api/*.py and
 * backend/app/db/repository.py). Only fields the backend actually returns.
 */

export interface GeoJsonPolygon {
  type: 'Polygon'
  coordinates: number[][][]
}

export interface GeoJsonGeometry {
  type: string
  coordinates: unknown
}

/** GET /api/health */
export interface HealthResponse {
  status: string
  app_mode: 'real' | 'demo'
  model_version: string
}

/** GET /api/providers/status */
export interface ProviderStatus {
  name: string
  configured: boolean
  required_credentials: string[]
}
export interface ProvidersStatusResponse {
  app_mode: 'real' | 'demo'
  providers: ProviderStatus[]
}

/** GET /api/incidents */
export interface Incident {
  id: string
  name: string
  status: string
  bbox: GeoJsonPolygon
  created_at: string
}
export interface IncidentsResponse {
  incidents: Incident[]
}

/** GET /api/scenes */
export interface Scene {
  id: string
  incident_id: string | null
  provider: string
  product_id: string
  acquisition_time: string
  polarization: string | null
  processing_status: string
  geometry: GeoJsonGeometry
}
export interface ScenesResponse {
  scenes: Scene[]
}

/** GET /api/reports */
export interface ReportSummary {
  id: string
  incident_id: string
  generated_at: string
  leading_candidate_mmsi: string | null
  decision_status: string | null
}
export interface ReportsResponse {
  reports: ReportSummary[]
}

/** GET /api/observations */
export interface Observation {
  id: string
  incident_id: string | null
  scene_id: string | null
  original_filename: string | null
  file_kind: string | null
  sensor: string | null
  product_id: string | null
  product_type: string | null
  acquisition_time: string | null
  polarization: string | null
  bbox: [number, number, number, number] | null
  status: string
  error_message: string | null
  created_at: string
}
export interface ObservationsResponse {
  observations: Observation[]
}

/** GET /api/observations/{id} and items of GET /api/observations (detail adds diagnostics). */
export interface ObservationDetail extends Observation {
  safe_dir: string | null
  extraction_diagnostics: { warnings?: string[]; context?: Record<string, unknown> } & Record<string, unknown>
}

/** POST /api/observations/ingest */
export interface IngestResponse {
  observation_id: string
  status: string
  incident_id: string | null
  sensor: string | null
  product_id: string | null
  product_type: string | null
  acquisition_time: string | null
  polarization: string | null
  bbox: [number, number, number, number] | null
  warnings: string[]
}

/** Provenance dump attached to each CDSE search result (app/core/provenance.py). */
export interface SceneProvenance {
  kind: string
  source: string
  dataset?: string | null
  product_id?: string | null
  time_start?: string | null
  bbox?: number[] | null
  source_url?: string | null
  retrieved_at?: string | null
}

export interface SceneAsset {
  href?: string
  title?: string
  type?: string
  roles?: string[]
}

/** GET /api/scenes/search -> scenes[] (SceneRef built in providers/sentinel1/cdse.py). */
export interface SceneSearchItem {
  product_id: string | null
  collection: string | null
  acquisition_time: string | null
  orbit_direction: string | null
  polarizations: string[] | null
  product_type: string | null
  geometry: GeoJsonGeometry | null
  bbox: number[] | null
  assets: Record<string, SceneAsset>
  source_url: string | null
  provenance: SceneProvenance | null
}
export interface SceneSearchResponse {
  count: number
  scenes: SceneSearchItem[]
}

/** GET /api/scenes/{product_id}: the raw CDSE STAC item, passed through unchanged. */
export interface StacItem {
  id?: string
  collection?: string
  geometry?: GeoJsonGeometry | null
  bbox?: number[] | null
  properties?: Record<string, unknown>
  assets?: Record<string, SceneAsset>
  links?: { rel?: string; href?: string }[]
}

/** Error body from app.main VarunaError handler. */
export interface VarunaErrorBody {
  reason_code: string
  message: string
  context?: Record<string, unknown>
}

/* ---------- Phase 3: investigation workspace (M1-M4) ---------- */

/** Provenance dump (backend/app/core/provenance.py). */
export interface ProvenanceDump {
  kind: string
  source: string
  dataset?: string | null
  product_id?: string | null
  variable?: string | null
  time_start?: string | null
  time_end?: string | null
  bbox?: number[] | null
  source_url?: string | null
  retrieved_at?: string | null
  processing_version?: string | null
  model_version?: string | null
  parameters?: Record<string, unknown>
  notes?: string | null
}

/** POST /api/incidents */
export interface IncidentCreateBody { name: string; minlon: number; minlat: number; maxlon: number; maxlat: number }
export interface IncidentCreated { id: string; name: string; status: string }

/** GET /api/incidents/{id} */
export interface DetectionRow {
  id: string
  geometry: GeoJsonGeometry
  area_km2: number
  detection_score: number
  classification_label: string
}
export interface IncidentDetail {
  incident: { id: string; name: string; bbox: GeoJsonPolygon; status: string }
  detections: DetectionRow[]
}

/** POST /api/detection/run and GET /api/detection/{id} */
export interface DetectionRunBody {
  incident_id: string; product_id: string
  minlon: number; minlat: number; maxlon: number; maxlat: number
  polarization: string
}
export interface DetectionCandidate {
  geometry: GeoJsonGeometry
  pixel_count?: number
  area_km2?: number
  perimeter_km?: number
  centroid?: [number, number]
  orientation_deg?: number
  length_km?: number
  width_km?: number
  elongation?: number
  compactness?: number
  contrast_db?: number | null
  distance_to_land_km?: number
  detection_score?: number
  classification_label: string
  rejected_reason: string | null
}
export interface DetectionRunResult {
  detection_id: string
  incident_id: string
  scene_id: string
  persisted_detection_ids: string[]
  product_id: string
  candidates: DetectionCandidate[]
  diagnostics: {
    dark_pixel_fraction?: number
    raw_component_count?: number
    accepted_count?: number
    cfar_params?: Record<string, unknown>
  } & Record<string, unknown>
  provenance: ProvenanceDump
}

/** GET /api/environment/wind | /currents (summary only: the backend returns no gridded values). */
export interface EnvironmentSummary {
  provenance: ProvenanceDump
  variables: string[]
  shape: Record<string, number[]>
  time_steps?: number | null
}
export interface EnvironmentParams { minlon: number; minlat: number; maxlon: number; maxlat: number; start: string; end: string }

/** POST /api/drift/backward, GET /api/drift/{id} */
export interface DriftBackwardBody {
  incident_id: string
  slick_geometry: GeoJsonPolygon
  observation_time: string
  age_hours_min: number
  age_hours_max: number
  ensemble_size?: number
}
export interface OriginAnalysis {
  id: string
  incident_id: string
  probable_origin_geometry: GeoJsonGeometry | null
  probable_origin_centroid: { lon: number; lat: number } | null
  release_start: string
  release_end: string
  observation_time?: string | null
  uncertainty_km: number
  ensemble_size: number
  model_version: string
  density_field_path?: string | null
  provenance: { wind?: ProvenanceDump; current?: ProvenanceDump }
}

/** POST /api/drift/forecast */
export interface ForecastResponse {
  analysis_id: string
  seeded_from: string
  forecast_hours: number[]
  forecasts: Record<string, { geometry: GeoJsonGeometry; centroid: { lon: number; lat: number }; spread_km: number }>
  provenance: { wind?: ProvenanceDump; current?: ProvenanceDump }
}

/** GET /api/vessels/candidates (attribution/scoring.py score_candidates) */
export interface VesselCandidate {
  vessel_key?: string
  mmsi?: string | null
  imo?: string | null
  name?: string | null
  vessel_type?: string | null
  best_fit_hour?: number | null
  best_fit_position?: { lon: number; lat: number } | null
  spatial_score?: number
  temporal_score?: number
  trajectory_score?: number
  behavioural_score?: number
  overall_score?: number
  status?: string
  db_id?: string
}
export interface VesselCandidatesResponse { analysis_id: string; candidate_count: number; candidates: VesselCandidate[] }

/* ---------- Phase 4 · M5 PASHA (backend/app/api/pasha.py) ---------- */
export interface PhysicalPlausibility {
  plausible: boolean
  estimated_spill_tonnes_low?: number
  estimated_spill_tonnes_high?: number
  vessel_capacity_tonnes?: number
  reason?: string
}
/** attribution/falsification.py run_falsification_gate() output, plus physical_consistency_score added by the PASHA route. */
export interface FalsificationResult {
  spatial_test: boolean
  temporal_test: boolean
  drift_test: boolean
  physical_test: boolean
  behavioural_signal?: number
  reasons: string[]
  pass_fail: boolean
  physical_consistency_score?: number
}
export interface PashaCandidate extends VesselCandidate {
  physical_plausibility?: PhysicalPlausibility
  falsification?: FalsificationResult
}
export interface PashaOutcome {
  status: string
  reason: string
  leading_candidate: string | null
  margin: number | null
}
/** POST /api/pasha/run and GET /api/pasha/{run_id} */
export interface PashaRunResult {
  run_id: string
  analysis_id: string
  outcome: PashaOutcome
  candidates: PashaCandidate[]
}
export interface PashaRunBody {
  analysis_id: string
  candidates: VesselCandidate[]
  observed_slick_geometry: GeoJsonPolygon
}
/** GET /api/pasha?incident_id= */
export interface PashaHistoryRow {
  run_id: string
  analysis_id: string
  incident_id: string
  created_at: string
  status: string | null
  leading_candidate_mmsi: string | null
  leading_candidate_name: string | null
  candidate_count: number
}
export interface PashaHistoryResponse { runs: PashaHistoryRow[] }

/* ---------- Phase 5 · M6 reports (backend/app/api/reports.py) ---------- */
/** POST /api/reports/{incident_id}/generate. Only real, already-fetched values are ever placed in the two metadata dicts. */
export interface ReportGenerateBody {
  pasha_run_id: string
  observed_slick_geometry: Record<string, unknown>
  sentinel1_scene: Record<string, unknown>
  spill_detection: Record<string, unknown>
  detection_candidates?: Record<string, unknown>[]
  forecast?: {
    horizon: string
    lat: string
    lon: string
    spread: string
  }[]
}
/** Response of POST /reports/{incident_id}/generate. `report_path` is a server-side path and is never displayed. */
export interface ReportGenerated {
  report_id: string
  incident_id: string
  pasha_run_id: string
  generated_at: string
  decision_status: string
  report_path: string
}
