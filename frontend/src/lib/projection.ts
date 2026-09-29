import type { Ring } from './format'

export interface Bounds { minlon: number; maxlon: number; minlat: number; maxlat: number }
export const MAP_W = 1000
export const MAP_H = 560
const FALLBACK: Bounds = { minlon: 55, maxlon: 100, minlat: 0, maxlat: 30 }

export function niceStep(span: number): number {
  const raw = span / 6
  const pow = Math.pow(10, Math.floor(Math.log10(raw)))
  const n = raw / pow
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * pow
}

/** Fits points into the fixed viewBox with an equirectangular, latitude-corrected projection. */
export function makeProjection(pts: [number, number][]) {
  let b = FALLBACK
  if (pts.length) {
    const lons = pts.map((p) => p[0]), lats = pts.map((p) => p[1])
    let minlon = Math.min(...lons), maxlon = Math.max(...lons), minlat = Math.min(...lats), maxlat = Math.max(...lats)
    const padLon = Math.max((maxlon - minlon) * 0.15, 0.05), padLat = Math.max((maxlat - minlat) * 0.15, 0.05)
    minlon -= padLon; maxlon += padLon; minlat = Math.max(-89, minlat - padLat); maxlat = Math.min(89, maxlat + padLat)
    b = { minlon, maxlon, minlat, maxlat }
  }
  const kx = Math.cos((((b.minlat + b.maxlat) / 2) * Math.PI) / 180)
  const wu = (b.maxlon - b.minlon) * kx, hu = b.maxlat - b.minlat
  const s = Math.min(MAP_W / wu, MAP_H / hu)
  const ox = (MAP_W - wu * s) / 2, oy = (MAP_H - hu * s) / 2
  const proj = (lon: number, lat: number): [number, number] => [ox + (lon - b.minlon) * kx * s, oy + (b.maxlat - lat) * s]
  const inv = (x: number, y: number): [number, number] => [b.minlon + (x - ox) / (kx * s), b.maxlat - (y - oy) / s]
  return { b, proj, inv, scale: s, hasData: pts.length > 0 }
}

/** Keeps SVG paths light: very large rings are strided down to at most `max` vertices (shape preserved, closure kept). */
export function decimate(r: Ring, max = 1200): Ring {
  if (r.length <= max) return r
  const step = Math.ceil(r.length / max)
  const out = r.filter((_, i) => i % step === 0)
  out.push(r[r.length - 1])
  return out
}

export const bboxRing = (b: number[]): Ring => [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]], [b[0], b[1]]]
