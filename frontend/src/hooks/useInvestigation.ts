import { useCallback, useMemo, useState } from 'react'
import {
  createIncident, getCurrents, getDetectionRun, getDriftAnalysis, getIncidentDetail, getObservationsFor, getScenesFor, getVesselCandidates, getWind,
  runBackwardDrift, runDetection, runForecast, attachObservation,
} from '../api'
import { useApi } from './useApi'
import { useOperation, type OpState } from './useOperation'
import { readRefs, writeRefs, type InvestigationRefs } from '../lib/refs'
import {
  isoNoMillis, polarizationFor, ringBounds, selectSlick, toUtcIso, usableObservation, type StageInfo, type StageState,
} from '../lib/investigation'
import { outerRings } from '../lib/format'
import type {
  EnvironmentSummary, ForecastResponse, Observation, OriginAnalysis, ProvidersStatusResponse, VesselCandidatesResponse,
} from '../types/api'

export const DEFAULT_AGE_MIN = 6
export const DEFAULT_AGE_MAX = 30
const ENV_MARGIN_DEG = 0.5 // same margin the backend pipeline applies around the slick

/** Incident record + linked observations + persisted scenes + locally remembered result ids. */
export function useInvestigation(id: string) {
  const incident = useApi((s) => getIncidentDetail(id, s), [id])
  const observations = useApi((s) => getObservationsFor(id, s), [id])
  const scenes = useApi((s) => getScenesFor(id, s), [id])
  const [refs, setRefsState] = useState<InvestigationRefs>(() => readRefs(id))
  const patchRefs = useCallback((p: Partial<InvestigationRefs>) => setRefsState(writeRefs(id, p)), [id])
  const reload = useCallback(() => { incident.retry(); observations.retry(); scenes.retry() }, [incident, observations, scenes])

  const obsList: Observation[] = observations.data?.observations ?? []
  const input = useMemo(() => usableObservation(obsList), [obsList])
  const detections = incident.data?.detections ?? []
  const slick = useMemo(() => selectSlick(detections), [detections])
  const observationTime = input?.acquisition_time ?? scenes.data?.scenes[0]?.acquisition_time ?? null
  const attach = useOperation(async (observationId: string) => { const r = await attachObservation(observationId, id); observations.retry(); return r })

  return { incident, observations, scenes, refs, patchRefs, reload, input, slick, detections, observationTime, attach }
}
export type InvestigationCtx = ReturnType<typeof useInvestigation>

/** M1 — POST /detection/run; the stored run (if any) is re-read by id from GET /detection/{id}. */
export function useDetection(ctx: InvestigationCtx, incidentId: string) {
  const { input, refs, patchRefs, incident } = ctx
  const stored = useApi((s) => (refs.detectionId ? getDetectionRun(refs.detectionId, s) : Promise.resolve(null)), [refs.detectionId])
  const op = useOperation(runDetection)
  const start = useCallback(async () => {
    if (!input || !input.product_id || !input.bbox) return
    const [minlon, minlat, maxlon, maxlat] = input.bbox
    const r = await op.run({ incident_id: incidentId, product_id: input.product_id, minlon, minlat, maxlon, maxlat, polarization: polarizationFor(input) })
    if (r) { ctx.patchRefs({ detectionId: r.detection_id }); incident.retry(); ctx.scenes.retry() }
  }, [input, incidentId, op, ctx, incident])
  const result = op.state.status === 'success' ? op.state.data : stored.data
  return { op: op.state, stored, result, start, forget: () => patchRefs({ detectionId: undefined }) }
}

/** M2 — ERA5 wind + CMEMS currents summaries for the slick area and hindcast window. */
export function useEnvironment(ctx: InvestigationCtx) {
  const { slick, observationTime, refs, patchRefs } = ctx
  const ageMax = refs.ageMax ?? DEFAULT_AGE_MAX
  const request = useMemo(() => {
    const b = ringBounds(slick ? outerRings(slick.detection.geometry) : [])
    if (!b || !observationTime) return null
    const end = new Date(toUtcIso(observationTime))
    if (Number.isNaN(end.getTime())) return null
    const start = new Date(end.getTime() - (ageMax + 6) * 3_600_000)
    return {
      minlon: b[0] - ENV_MARGIN_DEG, minlat: b[1] - ENV_MARGIN_DEG, maxlon: b[2] + ENV_MARGIN_DEG, maxlat: b[3] + ENV_MARGIN_DEG,
      start: isoNoMillis(start), end: isoNoMillis(end),
    }
  }, [slick, observationTime, ageMax])
  const wind = useOperation(getWind)
  const currents = useOperation(getCurrents)
  const run = useCallback(async () => {
    if (!request) return
    const [w, c] = await Promise.all([wind.run(request), currents.run(request)])
    patchRefs({ ...(w ? { wind: w } : {}), ...(c ? { currents: c } : {}) })
  }, [request, wind, currents, patchRefs])
  const windData: EnvironmentSummary | null = wind.state.status === 'success' ? wind.state.data : refs.wind ?? null
  const currentsData: EnvironmentSummary | null = currents.state.status === 'success' ? currents.state.data : refs.currents ?? null
  return { request, wind: wind.state, currents: currents.state, windData, currentsData, run, ageMax }
}

/** M3 — backward reconstruction + forward forecast. */
export function useDrift(ctx: InvestigationCtx, incidentId: string) {
  const { slick, observationTime, refs, patchRefs } = ctx
  const stored = useApi((s) => (refs.analysisId ? getDriftAnalysis(refs.analysisId, s) : Promise.resolve(null)), [refs.analysisId])
  const backward = useOperation(runBackwardDrift)
  const forecastOp = useOperation(runForecast)
  const ageMin = refs.ageMin ?? DEFAULT_AGE_MIN, ageMax = refs.ageMax ?? DEFAULT_AGE_MAX

  const start = useCallback(async (min: number, max: number, ensemble?: number) => {
    if (!slick?.polygon || !observationTime) return
    patchRefs({ ageMin: min, ageMax: max })
    const r = await backward.run({
      incident_id: incidentId, slick_geometry: slick.polygon, observation_time: toUtcIso(observationTime),
      age_hours_min: min, age_hours_max: max, ...(ensemble ? { ensemble_size: ensemble } : {}),
    })
    if (r) patchRefs({ analysisId: r.id, forecast: undefined, vessels: undefined })
  }, [slick, observationTime, incidentId, backward, patchRefs])

  const forecast = useCallback(async (hours: number[]) => {
    if (!refs.analysisId) return
    const r = await forecastOp.run(refs.analysisId, hours)
    if (r) patchRefs({ forecast: r })
  }, [refs.analysisId, forecastOp, patchRefs])

  const analysis: OriginAnalysis | null = stored.data ?? (backward.state.status === 'success' ? backward.state.data : null)
  const forecastData: ForecastResponse | null = forecastOp.state.status === 'success' ? forecastOp.state.data : refs.forecast ?? null
  return { stored, backward: backward.state, forecastOp: forecastOp.state, analysis, forecastData, start, forecast, ageMin, ageMax, forget: () => patchRefs({ analysisId: undefined, forecast: undefined, vessels: undefined }) }
}

/** M4 — GET /vessels/candidates for a completed drift analysis. */
export function useVessels(ctx: InvestigationCtx, analysisId: string | undefined) {
  const { refs, patchRefs } = ctx
  const op = useOperation(getVesselCandidates)
  const run = useCallback(async (maxDistanceKm: number) => {
    if (!analysisId) return
    const r = await op.run(analysisId, maxDistanceKm)
    if (r) patchRefs({ vessels: r })
  }, [analysisId, op, patchRefs])
  const data: VesselCandidatesResponse | null = op.state.status === 'success' ? op.state.data : refs.vessels && refs.vessels.analysis_id === analysisId ? refs.vessels : null
  return { op: op.state, data, run }
}

const providerOk = (p: ProvidersStatusResponse | null, name: string): boolean | null => {
  const hit = p?.providers.find((x) => x.name === name)
  return hit ? hit.configured : null
}

interface ProgressArgs {
  ctx: InvestigationCtx
  providers: ProvidersStatusResponse | null
  detection: ReturnType<typeof useDetection>
  env: ReturnType<typeof useEnvironment>
  drift: ReturnType<typeof useDrift>
  vessels: ReturnType<typeof useVessels>
}

const failed = (s: OpState<unknown>) => s.status === 'error'

/**
 * Stage state derived from what the backend actually holds plus requests genuinely in flight.
 * The synchronous stage endpoints expose no progress percentage, so none is shown.
 */
export function useInvestigationProgress({ ctx, providers, detection, env, drift, vessels }: ProgressArgs): StageInfo[] {
  const s1 = providerOk(providers, 'sentinel1_cdse'), era5 = providerOk(providers, 'era5_cds'), cmems = providerOk(providers, 'cmems'), ais = providerOk(providers, 'ais_global_fishing_watch')
  const hasSlick = !!ctx.slick
  const pick = (locked: string | null, unavailable: string | null, running: boolean, err: string | null, done: string | null, ready: string): { state: StageState; note: string } => {
    if (running) return { state: 'running', note: 'Request in progress on the backend' }
    if (err) return { state: 'failed', note: err }
    if (done) return { state: 'completed', note: done }
    if (locked) return { state: 'locked', note: locked }
    if (unavailable) return { state: 'unavailable', note: unavailable }
    return { state: 'ready', note: ready }
  }
  const m1done = detection.result ? `${detection.result.diagnostics.accepted_count ?? 0} accepted candidate(s)` : ctx.detections.length ? `${ctx.detections.length} persisted detection(s)` : null
  const m1 = pick(
    ctx.input ? null : 'No ready SAR observation is linked to this investigation',
    s1 === false ? 'Sentinel-1 provider credentials are not configured on the backend' : null,
    detection.op.status === 'running', detection.op.status === 'error' ? detection.op.error.message : null, m1done, 'SAR observation linked; detection not run yet')
  const m2 = pick(
    hasSlick ? null : 'Needs a detected slick from M1',
    era5 === false || cmems === false ? 'ERA5 or CMEMS credentials are not configured on the backend' : null,
    env.wind.status === 'running' || env.currents.status === 'running',
    failed(env.wind) && failed(env.currents) && !env.windData && !env.currentsData ? 'Both environmental retrievals failed' : null,
    env.windData || env.currentsData ? `${[env.windData && 'wind', env.currentsData && 'currents'].filter(Boolean).join(' + ')} retrieved` : null,
    'Slick located; environmental context not retrieved')
  const m3 = pick(
    hasSlick && ctx.slick?.polygon ? null : hasSlick ? 'Detected geometry is not a Polygon' : 'Needs a detected slick from M1',
    era5 === false || cmems === false ? 'ERA5 or CMEMS credentials are not configured on the backend' : null,
    drift.backward.status === 'running', drift.backward.status === 'error' ? drift.backward.error.message : null,
    drift.analysis ? `Analysis ${drift.analysis.id.slice(0, 8)} · ±${drift.analysis.uncertainty_km} km` : null, 'Ready for backward reconstruction')
  // A 404 here is the backend's own "AIS data unavailable for this window" answer, not a crash.
  const noAis = vessels.op.status === 'error' && vessels.op.error.status === 404 ? vessels.op.error.message : null
  const m4 = pick(
    drift.analysis ? null : 'Needs a completed drift analysis from M3',
    noAis ?? (ais === false ? 'AIS (Global Fishing Watch) token is not configured on the backend' : null),
    vessels.op.status === 'running', vessels.op.status === 'error' && !noAis ? vessels.op.error.message : null,
    vessels.data && !noAis ? `${vessels.data.candidate_count} candidate vessel(s) scored` : null, 'Drift analysis ready; vessels not correlated')
  return [
    { key: 'm1', code: 'M1', title: 'SAR Detection', ...m1 },
    { key: 'm2', code: 'M2', title: 'Environmental Context', ...m2 },
    { key: 'm3', code: 'M3', title: 'Drift Reconstruction', ...m3 },
    { key: 'm4', code: 'M4', title: 'Vessel Correlation', ...m4 },
  ]
}

/** POST /incidents, optionally attaching an ingested observation (the backend's own link between the two). */
export function useCreateInvestigation() {
  return useOperation(async (body: Parameters<typeof createIncident>[0], observationId: string | null) => {
    const created = await createIncident(body)
    if (observationId) await attachObservation(observationId, created.id)
    return created
  })
}
