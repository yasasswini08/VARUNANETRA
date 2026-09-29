import { apiBlob, apiGet, apiPost, apiUpload } from './client'
import type {
  HealthResponse, IncidentsResponse, IngestResponse, ObservationDetail, ObservationsResponse, SceneSearchResponse, StacItem,
  ProvidersStatusResponse, ReportsResponse, ScenesResponse,
  IncidentCreateBody, IncidentCreated, IncidentDetail, DetectionRunBody, DetectionRunResult, EnvironmentParams, EnvironmentSummary,
  DriftBackwardBody, OriginAnalysis, ForecastResponse, VesselCandidatesResponse,
  PashaRunBody, PashaRunResult, PashaHistoryResponse, ReportGenerateBody, ReportGenerated,
} from '../types/api'

export { ApiError, API_BASE_URL } from './client'
export const getObservationsFor = (incidentId: string, s?: AbortSignal) => apiGet<ObservationsResponse>('/observations', { incident_id: incidentId, limit: LIST_LIMIT }, s)
export const getScenesFor = (incidentId: string, s?: AbortSignal) => apiGet<ScenesResponse>('/scenes', { incident_id: incidentId, limit: LIST_LIMIT }, s)

export const LIST_LIMIT = 100

export const getHealth = (s?: AbortSignal) => apiGet<HealthResponse>('/health', undefined, s)
export const getProvidersStatus = (s?: AbortSignal) => apiGet<ProvidersStatusResponse>('/providers/status', undefined, s)
export const getIncidents = (s?: AbortSignal) => apiGet<IncidentsResponse>('/incidents', { limit: LIST_LIMIT }, s)
export const getScenes = (s?: AbortSignal) => apiGet<ScenesResponse>('/scenes', { limit: LIST_LIMIT }, s)
export const getReports = (s?: AbortSignal) => apiGet<ReportsResponse>('/reports', { limit: LIST_LIMIT }, s)
export const getObservations = (s?: AbortSignal) => apiGet<ObservationsResponse>('/observations', { limit: LIST_LIMIT }, s)

export interface SceneSearchParams {
  minlon: number; minlat: number; maxlon: number; maxlat: number
  start: string; end: string; max_results: number
}
/** Live CDSE catalogue search. Never touches the database. */
export const searchScenes = (p: SceneSearchParams, s?: AbortSignal) =>
  apiGet<SceneSearchResponse>('/scenes/search', { ...p }, s)
export const getSceneDetail = (productId: string, s?: AbortSignal) =>
  apiGet<StacItem>(`/scenes/${encodeURIComponent(productId)}`, undefined, s)
export const getObservationDetail = (id: string, s?: AbortSignal) =>
  apiGet<ObservationDetail>(`/observations/${encodeURIComponent(id)}`, undefined, s)
export const ingestObservation = (file: File, onProgress?: (f: number) => void, s?: AbortSignal) => {
  const form = new FormData()
  form.append('file', file)
  return apiUpload<IngestResponse>('/observations/ingest', form, onProgress, s)
}

/* Phase 3 — investigation workspace */
export const createIncident = (b: IncidentCreateBody) => apiPost<IncidentCreated>('/incidents', { ...b })
export const getIncidentDetail = (id: string, s?: AbortSignal) => apiGet<IncidentDetail>(`/incidents/${encodeURIComponent(id)}`, undefined, s)
export const attachObservation = (observationId: string, incidentId: string) => {
  const form = new FormData()
  form.append('incident_id', incidentId)
  return apiPost<ObservationDetail>(`/observations/${encodeURIComponent(observationId)}/attach`, form)
}
export const runDetection = (b: DetectionRunBody, s?: AbortSignal) => apiPost<DetectionRunResult>('/detection/run', { ...b }, s)
export const getDetectionRun = (id: string, s?: AbortSignal) => apiGet<DetectionRunResult>(`/detection/${encodeURIComponent(id)}`, undefined, s)
export const getWind = (p: EnvironmentParams, s?: AbortSignal) => apiGet<EnvironmentSummary>('/environment/wind', { ...p }, s)
export const getCurrents = (p: EnvironmentParams, s?: AbortSignal) => apiGet<EnvironmentSummary>('/environment/currents', { ...p }, s)
export const runBackwardDrift = (b: DriftBackwardBody, s?: AbortSignal) => apiPost<OriginAnalysis>('/drift/backward', { ...b }, s)
export const getDriftAnalysis = (id: string, s?: AbortSignal) => apiGet<OriginAnalysis>(`/drift/${encodeURIComponent(id)}`, undefined, s)
export const runForecast = (analysisId: string, hours: number[], s?: AbortSignal) =>
  apiPost<ForecastResponse>('/drift/forecast', { analysis_id: analysisId, forecast_hours: hours }, s)
export const getVesselCandidates = (analysisId: string, maxDistanceKm: number, s?: AbortSignal) =>
  apiGet<VesselCandidatesResponse>('/vessels/candidates', { analysis_id: analysisId, max_distance_km: maxDistanceKm }, s)

/* Phase 4 — M5 PASHA */
export const runPasha = (b: PashaRunBody, s?: AbortSignal) => apiPost<PashaRunResult>('/pasha/run', { ...b }, s)
export const getPashaRun = (id: string, s?: AbortSignal) => apiGet<PashaRunResult>(`/pasha/${encodeURIComponent(id)}`, undefined, s)
export const listPashaRuns = (incidentId: string, s?: AbortSignal) => apiGet<PashaHistoryResponse>('/pasha', { incident_id: incidentId, limit: LIST_LIMIT }, s)

/** Phase 5 — M6 reports. GET /reports/{id} streams the PDF; there is no JSON report-detail endpoint. */
export const getReportsFor = (incidentId: string, s?: AbortSignal) => apiGet<ReportsResponse>('/reports', { incident_id: incidentId, limit: LIST_LIMIT }, s)
export const generateReport = (incidentId: string, b: ReportGenerateBody, s?: AbortSignal) =>
  apiPost<ReportGenerated>(`/reports/${encodeURIComponent(incidentId)}/generate`, { ...b }, s)
export const fetchReportPdf = (reportId: string, s?: AbortSignal) => apiBlob(`/reports/${encodeURIComponent(reportId)}`, s)
/** GET /pasha without incident_id lists runs across all incidents (used by history). */
export const listAllPashaRuns = (s?: AbortSignal) => apiGet<PashaHistoryResponse>('/pasha', { limit: LIST_LIMIT }, s)
