import type { DetectionRow, GeoJsonGeometry, GeoJsonPolygon, Observation } from '../types/api'
import { outerRings, type Ring } from './format'

export type StageKey = 'm1' | 'm2' | 'm3' | 'm4'
export type StageState = 'locked' | 'ready' | 'running' | 'completed' | 'failed' | 'unavailable'
export interface StageInfo { key: StageKey; code: string; title: string; state: StageState; note: string }

export const STAGE_LABEL: Record<StageState, string> = {
  locked: 'Not executed', ready: 'Ready', running: 'Running', completed: 'Complete', failed: 'Failed', unavailable: 'Unavailable',
}

/** Appends Z when the backend returned a naive timestamp, so the value is unambiguously UTC. */
export function toUtcIso(iso: string): string {
  return /(Z|[+-]\d{2}:?\d{2})$/.test(iso) ? iso : `${iso}Z`
}

export function isoNoMillis(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/** Observation usable as M1 input: the backend needs product_id, footprint and acquisition time. */
export function usableObservation(list: Observation[]): Observation | null {
  return list.find((o) => o.status === 'ready' && o.product_id && o.bbox && o.acquisition_time) ?? null
}

const bboxArea = (r: Ring) => {
  const xs = r.map((p) => p[0]), ys = r.map((p) => p[1])
  return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys))
}

export interface Slick { detection: DetectionRow; polygon: GeoJsonPolygon | null; reduced: boolean }

/** Highest-scoring persisted detection. The drift API accepts only a Polygon; a MultiPolygon is reduced to its largest part and flagged. */
export function selectSlick(detections: DetectionRow[]): Slick | null {
  if (detections.length === 0) return null
  const detection = detections.reduce((a, b) => (b.detection_score > a.detection_score ? b : a))
  const g: GeoJsonGeometry = detection.geometry
  if (g.type === 'Polygon') return { detection, polygon: g as GeoJsonPolygon, reduced: false }
  if (g.type === 'MultiPolygon' && Array.isArray(g.coordinates)) {
    const parts = g.coordinates as number[][][][]
    const rings = outerRings(g)
    if (rings.length && parts.length === rings.length) {
      let best = 0
      rings.forEach((r, i) => { if (bboxArea(r) > bboxArea(rings[best])) best = i })
      return { detection, polygon: { type: 'Polygon', coordinates: parts[best] }, reduced: true }
    }
  }
  return { detection, polygon: null, reduced: false }
}

export function ringBounds(rings: Ring[]): [number, number, number, number] | null {
  const pts = rings.flat()
  if (!pts.length) return null
  const lons = pts.map((p) => p[0]), lats = pts.map((p) => p[1])
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)]
}

export function polarizationFor(o: Observation): string {
  return (o.polarization ?? 'vv').split('/')[0].toLowerCase()
}
