import type { OriginAnalysis, PashaCandidate, VesselCandidate } from '../types/api'
import type { MapLayers } from '../components/investigation/InvestigationMap'
import { outerRings } from './format'
import { bboxRing } from './projection'
import type { InvestigationCtx } from '../hooks/useInvestigation'

/** Stable route key for a candidate: the backend's own vessel_key, falling back to MMSI. */
export const vesselKey = (v: VesselCandidate, i = 0): string => v.vessel_key ?? v.mmsi ?? `idx-${i}`
export const vesselLabel = (v: VesselCandidate): string => v.name?.trim() || v.mmsi || v.vessel_key || 'Unnamed vessel'
/** Empty strings from the backend are treated as "not provided". */
export const txt = (v: string | null | undefined): string | null => (v && v.trim() ? v : null)

/** A candidate can be replayed only if the backend gave the inputs build_hypothesis() reads. */
export function replayable(v: VesselCandidate): string | null {
  if (!v.vessel_key) return 'no vessel_key returned'
  if (v.best_fit_hour === null || v.best_fit_hour === undefined) return 'no best-fit hour returned'
  if (!v.best_fit_position) return 'no best-fit position returned'
  return null
}

const R = 6371.0088
/** Great-circle distance. Derived in the browser from two backend-returned coordinates; never used for ranking. */
export function haversineKm(a: { lon: number; lat: number }, b: { lon: number; lat: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function releaseTime(observationIso: string | null, hour: number | null | undefined): Date | null {
  if (!observationIso || hour === null || hour === undefined) return null
  const t = new Date(/(Z|[+-]\d{2}:?\d{2})$/.test(observationIso) ? observationIso : `${observationIso}Z`).getTime()
  return Number.isNaN(t) ? null : new Date(t - hour * 3_600_000)
}

export interface LayerInputs {
  ctx: InvestigationCtx
  analysis: OriginAnalysis | null
  candidates: (VesselCandidate | PashaCandidate)[]
  selectedId?: string | null
  showCounterfactual?: boolean
}

/** Map layers built only from geometry the backend returned. Nothing is interpolated. */
export function buildLayers({ ctx, analysis: a, candidates, selectedId, showCounterfactual }: LayerInputs): MapLayers {
  const inc = ctx.incident.data?.incident
  const pts = candidates.flatMap((v, i) => v.best_fit_position ? [{ id: vesselKey(v, i), label: vesselLabel(v), lon: v.best_fit_position.lon, lat: v.best_fit_position.lat }] : [])
  return {
    incident: inc ? outerRings(inc.bbox) : [],
    scene: ctx.input?.bbox ? [bboxRing(ctx.input.bbox)] : [],
    slick: ctx.detections.flatMap((d) => outerRings(d.geometry)),
    env: [],
    origin: a?.probable_origin_geometry ? outerRings(a.probable_origin_geometry) : [],
    originCentroid: a?.probable_origin_centroid ?? null,
    uncertaintyKm: a?.probable_origin_centroid ? a.uncertainty_km : null,
    forecasts: [],
    vessels: showCounterfactual ? [] : pts,
    counterfactual: showCounterfactual ? pts : [],
    selectedId: selectedId ?? null,
  }
}
