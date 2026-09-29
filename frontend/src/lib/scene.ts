import type { GeoJsonGeometry, Scene, SceneSearchItem, StacItem } from '../types/api'
import { outerRings, type Ring } from './format'

export type SceneSource = 'cdse' | 'persisted'

/** One row in Scene Explorer, normalised from either live search or persisted scenes. */
export interface SceneRow {
  key: string
  productId: string
  time: string | null
  polarizations: string[]
  productType: string | null
  orbit: string | null
  provider: string
  status: string | null
  rings: Ring[]
  source: SceneSource
  raw: SceneSearchItem | Scene
}

const ringsOf = (g: GeoJsonGeometry | null, bbox: number[] | null): Ring[] => {
  const r = g ? outerRings(g) : []
  if (r.length) return r
  if (bbox && bbox.length >= 4) {
    const [a, b, c, d] = bbox
    return [[[a, b], [c, b], [c, d], [a, d], [a, b]]]
  }
  return []
}

export function fromSearch(items: SceneSearchItem[]): SceneRow[] {
  return items.filter((s) => s.product_id).map((s) => ({
    key: s.product_id as string,
    productId: s.product_id as string,
    time: s.acquisition_time,
    polarizations: s.polarizations ?? [],
    productType: s.product_type,
    orbit: s.orbit_direction,
    provider: s.provenance?.source ?? s.collection ?? 'CDSE',
    status: null,
    rings: ringsOf(s.geometry, s.bbox),
    source: 'cdse',
    raw: s,
  }))
}

export function fromPersisted(items: Scene[]): SceneRow[] {
  return items.map((s) => ({
    key: s.id,
    productId: s.product_id,
    time: s.acquisition_time,
    polarizations: s.polarization ? s.polarization.split('/') : [],
    productType: null,
    orbit: null,
    provider: s.provider,
    status: s.processing_status,
    rings: ringsOf(s.geometry, null),
    source: 'persisted',
    raw: s,
  }))
}

export interface Field { label: string; value: string }
export interface FieldGroup { title: string; fields: Field[] }

const str = (v: unknown): string | null => {
  if (v === null || v === undefined || v === '') return null
  if (Array.isArray(v)) return v.map(String).join(', ')
  if (typeof v === 'object') return null
  return String(v)
}

function group(title: string, pairs: [string, unknown][]): FieldGroup {
  return { title, fields: pairs.flatMap(([label, v]) => { const value = str(v); return value ? [{ label, value }] : [] }) }
}

/** Builds detail groups from the raw STAC item. Only keys present in the response are shown. */
export function groupsFromStac(item: StacItem): FieldGroup[] {
  const p = item.properties ?? {}
  const bbox = item.bbox && item.bbox.length >= 4 ? item.bbox.slice(0, 4).map((n) => n.toFixed(4)).join(', ') : null
  const assets = Object.keys(item.assets ?? {})
  return [
    group('Acquisition', [
      ['Scene ID', item.id], ['Acquisition time', p['datetime']], ['Start', p['start_datetime']], ['End', p['end_datetime']],
      ['Platform', p['platform']], ['Instruments', p['instruments']], ['Constellation', p['constellation']],
    ]),
    group('Product', [
      ['Collection', item.collection], ['Product type', p['product:type']], ['Processing level', p['processing:level']],
      ['Instrument mode', p['sar:instrument_mode']], ['Polarizations', p['sar:polarizations']],
      ['Orbit direction', p['sat:orbit_state']], ['Relative orbit', p['sat:relative_orbit']], ['Absolute orbit', p['sat:absolute_orbit']],
    ]),
    group('Geometry', [['Bounding box (minlon, minlat, maxlon, maxlat)', bbox], ['Geometry type', item.geometry?.type]]),
    group('Provider', [['Catalogue assets', assets.length ? `${assets.length} (${assets.slice(0, 6).join(', ')}${assets.length > 6 ? ', …' : ''})` : null]]),
  ].filter((g) => g.fields.length > 0)
}

export function groupsFromSearch(s: SceneSearchItem): FieldGroup[] {
  const bbox = s.bbox && s.bbox.length >= 4 ? s.bbox.slice(0, 4).map((n) => n.toFixed(4)).join(', ') : null
  const pv = s.provenance
  return [
    group('Acquisition', [['Scene ID', s.product_id], ['Acquisition time', s.acquisition_time]]),
    group('Product', [['Collection', s.collection], ['Product type', s.product_type], ['Polarizations', s.polarizations], ['Orbit direction', s.orbit_direction]]),
    group('Geometry', [['Bounding box (minlon, minlat, maxlon, maxlat)', bbox], ['Geometry type', s.geometry?.type]]),
    group('Provenance', [['Data kind', pv?.kind], ['Source', pv?.source], ['Dataset', pv?.dataset], ['Retrieved at', pv?.retrieved_at], ['Source URL', s.source_url]]),
  ].filter((g) => g.fields.length > 0)
}
