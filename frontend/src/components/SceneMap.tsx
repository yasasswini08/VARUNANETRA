import { useMemo, useRef, useState } from 'react'
import { Crosshair, MousePointer2, Square } from 'lucide-react'
import { fmtLat, fmtLon, type Ring } from '../lib/format'

export interface Bbox { minlon: number; minlat: number; maxlon: number; maxlat: number }
export interface Footprint { id: string; label: string; rings: Ring[] }

const W = 1000
const H = 560
const DEFAULT: Bbox = { minlon: 55, maxlon: 100, minlat: 0, maxlat: 30 }

function niceStep(span: number): number {
  const raw = span / 6
  const pow = Math.pow(10, Math.floor(Math.log10(raw)))
  const n = raw / pow
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * pow
}

interface Props {
  footprints: Footprint[]
  selectedId?: string | null
  onSelect?: (id: string) => void
  aoi?: Bbox | null
  /** When provided, a draw tool is shown; a drag on the map yields a bounding box. */
  onDrawAoi?: (b: Bbox) => void
  compact?: boolean
}

/**
 * Schematic equirectangular projection of REAL scene footprints and the search area.
 * No basemap tiles are configured, so none are faked; the graticule keeps it legible.
 */
export function SceneMap({ footprints, selectedId, onSelect, aoi, onDrawAoi, compact }: Props) {
  const [cursor, setCursor] = useState<{ lat: number; lon: number } | null>(null)
  const [drawMode, setDrawMode] = useState(false)
  const [drag, setDrag] = useState<{ a: [number, number]; b: [number, number] } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const m = useMemo(() => {
    const pts: [number, number][] = footprints.flatMap((f) => f.rings.flat())
    if (aoi) pts.push([aoi.minlon, aoi.minlat], [aoi.maxlon, aoi.maxlat])
    let b = DEFAULT
    if (pts.length) {
      const lons = pts.map((p) => p[0]), lats = pts.map((p) => p[1])
      let minlon = Math.min(...lons), maxlon = Math.max(...lons), minlat = Math.min(...lats), maxlat = Math.max(...lats)
      const padLon = Math.max((maxlon - minlon) * 0.2, 1.5), padLat = Math.max((maxlat - minlat) * 0.2, 1)
      minlon -= padLon; maxlon += padLon; minlat = Math.max(-89, minlat - padLat); maxlat = Math.min(89, maxlat + padLat)
      b = { minlon, maxlon, minlat, maxlat }
    }
    const kx = Math.cos((((b.minlat + b.maxlat) / 2) * Math.PI) / 180)
    const wu = (b.maxlon - b.minlon) * kx, hu = b.maxlat - b.minlat
    const s = Math.min(W / wu, H / hu)
    const ox = (W - wu * s) / 2, oy = (H - hu * s) / 2
    const proj = (lon: number, lat: number): [number, number] => [ox + (lon - b.minlon) * kx * s, oy + (b.maxlat - lat) * s]
    const inv = (x: number, y: number): [number, number] => [b.minlon + (x - ox) / (kx * s), b.maxlat - (y - oy) / s]
    return { b, proj, inv, hasData: footprints.length > 0 }
  }, [footprints, aoi])

  const { b, proj, inv } = m
  const lonStep = niceStep(b.maxlon - b.minlon), latStep = niceStep(b.maxlat - b.minlat)
  const lons: number[] = [], lats: number[] = []
  for (let v = Math.ceil(b.minlon / lonStep) * lonStep; v <= b.maxlon; v += lonStep) lons.push(v)
  for (let v = Math.ceil(b.minlat / latStep) * latStep; v <= b.maxlat; v += latStep) lats.push(v)
  const path = (r: Ring) => r.map(([lo, la], i) => `${i ? 'L' : 'M'}${proj(lo, la).map((n) => n.toFixed(1)).join(' ')}`).join(' ') + 'Z'

  const toLonLat = (e: React.PointerEvent<SVGSVGElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect()
    const sc = Math.min(r.width / W, r.height / H)
    return inv((e.clientX - r.left - (r.width - W * sc) / 2) / sc, (e.clientY - r.top - (r.height - H * sc) / 2) / sc)
  }
  const clampBox = (a: [number, number], c: [number, number]): Bbox => ({
    minlon: Math.max(-180, Math.min(a[0], c[0])), maxlon: Math.min(180, Math.max(a[0], c[0])),
    minlat: Math.max(-90, Math.min(a[1], c[1])), maxlat: Math.min(90, Math.max(a[1], c[1])),
  })

  const onDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drawMode) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = toLonLat(e)
    setDrag({ a: p, b: p })
  }
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = toLonLat(e)
    setCursor({ lon: p[0], lat: p[1] })
    if (drag) setDrag({ ...drag, b: p })
  }
  const onUp = () => {
    if (!drag) return
    const box = clampBox(drag.a, drag.b)
    setDrag(null)
    if (box.maxlon - box.minlon > 0.01 && box.maxlat - box.minlat > 0.01) { onDrawAoi?.(box); setDrawMode(false) }
  }

  const rect = (bx: Bbox) => {
    const [x1, y1] = proj(bx.minlon, bx.maxlat), [x2, y2] = proj(bx.maxlon, bx.minlat)
    return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }
  }
  const dragBox = drag ? clampBox(drag.a, drag.b) : null

  return (
    <div className={`map map--scene${compact ? ' map--compact' : ''}`}>
      {onDrawAoi && (
        <div className="map__tools" role="toolbar" aria-label="Map tools">
          <button className={!drawMode ? 'is-on' : ''} aria-pressed={!drawMode} aria-label="Select footprints" title="Select footprints" onClick={() => setDrawMode(false)}><MousePointer2 size={16} /></button>
          <button className={drawMode ? 'is-on' : ''} aria-pressed={drawMode} aria-label="Draw search area" title="Draw search area" onClick={() => setDrawMode(true)}><Square size={16} /></button>
        </div>
      )}
      <svg ref={svgRef} className="map__svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img"
        style={{ cursor: drawMode ? 'crosshair' : undefined, touchAction: drawMode ? 'none' : undefined }}
        aria-label={m.hasData ? `Map showing ${footprints.length} scene footprints` : 'Map with no scene footprints to display'}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={() => setCursor(null)}>
        {lons.map((v) => { const [x] = proj(v, b.minlat); return <g key={`lo${v}`}><line className="grid-line" x1={x} x2={x} y1={0} y2={H} /><text className="grid-label" x={x + 4} y={H - 6}>{fmtLon(v)}</text></g> })}
        {lats.map((v) => { const [, y] = proj(b.minlon, v); return <g key={`la${v}`}><line className="grid-line" x1={0} x2={W} y1={y} y2={y} /><text className="grid-label" x={6} y={y - 4}>{fmtLat(v)}</text></g> })}
        {aoi && <rect className="poly--aoi" {...rect(aoi)} />}
        {footprints.flatMap((f) => f.rings.map((r, i) => (
          <path key={`${f.id}-${i}`} className={`poly poly--fp${selectedId === f.id ? ' is-active' : ''}`} d={path(r)}
            tabIndex={onSelect && i === 0 && !drawMode ? 0 : -1} role={onSelect ? 'button' : undefined} aria-label={`Scene ${f.label}`}
            style={drawMode ? { pointerEvents: 'none' } : undefined}
            onClick={() => onSelect?.(f.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(f.id) } }}>
            <title>{f.label}</title>
          </path>
        )))}
        {dragBox && <rect className="poly--aoi is-drawing" {...rect(dragBox)} />}
      </svg>

      <div className="map__legend" aria-hidden="true">
        {aoi && <span><i style={{ border: '1px solid var(--primary)', background: 'var(--primary-dim)' }} />Search area</span>}
        <span><i style={{ border: '1px dashed var(--blue)' }} />Scene footprint</span>
      </div>
      {!m.hasData && !aoi && <div className="map__empty"><div>No footprints to display</div></div>}
      <div className="map__note"><Crosshair size={11} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 5 }} />Schematic projection · no basemap or imagery configured</div>
      {cursor && <div className="map__coords">{fmtLat(cursor.lat)} {fmtLon(cursor.lon)}</div>}
    </div>
  )
}
