import type { GeoJsonGeometry, GeoJsonPolygon } from '../types/api'

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
}

export function timeAgo(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return iso
  const s = Math.max(0, (Date.now() - t) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`
  return formatDateTime(iso)
}

export const fmtLat = (v: number) => `${Math.abs(v).toFixed(2)}° ${v >= 0 ? 'N' : 'S'}`
export const fmtLon = (v: number) => `${Math.abs(v).toFixed(2)}° ${v >= 0 ? 'E' : 'W'}`

export type Ring = [number, number][]

/** Extract polygon rings (outer only) from Polygon / MultiPolygon GeoJSON, without `any`. */
export function outerRings(g: GeoJsonGeometry | GeoJsonPolygon): Ring[] {
  const c = g.coordinates
  if (!Array.isArray(c)) return []
  const asRing = (r: unknown): Ring | null =>
    Array.isArray(r) && r.every((p) => Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number')
      ? (r as number[][]).map((p) => [p[0], p[1]] as [number, number])
      : null
  if (g.type === 'Polygon') {
    const r = asRing(c[0])
    return r ? [r] : []
  }
  if (g.type === 'MultiPolygon') {
    return c.map((poly) => (Array.isArray(poly) ? asRing(poly[0]) : null)).filter((r): r is Ring => r !== null)
  }
  return []
}

export function ringCenter(r: Ring): [number, number] {
  let x = 0, y = 0
  r.forEach(([lon, lat]) => { x += lon; y += lat })
  return [x / r.length, y / r.length]
}
