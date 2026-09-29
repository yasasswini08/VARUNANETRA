import { useMemo, useState } from 'react'
import type { Incident, Scene } from '../types/api'
import { fmtLat, fmtLon, outerRings, type Ring } from '../lib/format'

const W = 1000
const H = 540
const DEFAULT_BOUNDS = { minLon: 55, maxLon: 100, minLat: 0, maxLat: 30 }

interface Props {
  incidents: Incident[]
  scenes: Scene[]
  selectedId?: string | null
  onSelect?: (id: string) => void
}

function niceStep(span: number): number {
  const raw = span / 6
  const pow = Math.pow(10, Math.floor(Math.log10(raw)))
  const n = raw / pow
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * pow
}

/**
 * Schematic equirectangular projection of REAL incident bboxes and scene footprints.
 * No basemap tiles are configured, so none are faked; the graticule keeps it legible.
 */
export function IncidentMap({ incidents, scenes, selectedId, onSelect }: Props) {
  const [cursor, setCursor] = useState<{ lat: number; lon: number } | null>(null)

  const model = useMemo(() => {
    const incRings = incidents.map((i) => ({ id: i.id, name: i.name, rings: outerRings(i.bbox) }))
    const sceneRings = scenes.map((s) => ({ id: s.id, rings: outerRings(s.geometry) }))
    const all: Ring[] = [...incRings, ...sceneRings].flatMap((x) => x.rings)
    const pts = all.flat()
    let b = DEFAULT_BOUNDS
    if (pts.length) {
      const lons = pts.map((p) => p[0]), lats = pts.map((p) => p[1])
      let minLon = Math.min(...lons), maxLon = Math.max(...lons), minLat = Math.min(...lats), maxLat = Math.max(...lats)
      const padLon = Math.max((maxLon - minLon) * 0.25, 1.5), padLat = Math.max((maxLat - minLat) * 0.25, 1.0)
      minLon -= padLon; maxLon += padLon; minLat -= padLat; maxLat += padLat
      b = { minLon, maxLon, minLat, maxLat }
    }
    const midLat = (b.minLat + b.maxLat) / 2
    const kx = Math.cos((midLat * Math.PI) / 180)
    const wUnits = (b.maxLon - b.minLon) * kx, hUnits = b.maxLat - b.minLat
    const s = Math.min(W / wUnits, H / hUnits)
    const ox = (W - wUnits * s) / 2, oy = (H - hUnits * s) / 2
    const proj = (lon: number, lat: number): [number, number] => [ox + (lon - b.minLon) * kx * s, oy + (b.maxLat - lat) * s]
    const inv = (x: number, y: number) => ({ lon: b.minLon + (x - ox) / (kx * s), lat: b.maxLat - (y - oy) / s })
    return { b, proj, inv, incRings, sceneRings, hasData: pts.length > 0 }
  }, [incidents, scenes])

  const { b, proj, inv } = model
  const lonStep = niceStep(b.maxLon - b.minLon), latStep = niceStep(b.maxLat - b.minLat)
  const lons: number[] = [], lats: number[] = []
  for (let v = Math.ceil(b.minLon / lonStep) * lonStep; v <= b.maxLon; v += lonStep) lons.push(v)
  for (let v = Math.ceil(b.minLat / latStep) * latStep; v <= b.maxLat; v += latStep) lats.push(v)
  const path = (r: Ring) => r.map(([lo, la], i) => `${i ? 'L' : 'M'}${proj(lo, la).map((n) => n.toFixed(1)).join(' ')}`).join(' ') + 'Z'

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const scale = Math.min(r.width / W, r.height / H)
    const x = (e.clientX - r.left - (r.width - W * scale) / 2) / scale
    const y = (e.clientY - r.top - (r.height - H * scale) / 2) / scale
    setCursor(inv(x, y))
  }

  return (
    <div className="map">
      <div className="map__sweep" aria-hidden="true" />
      <svg className="map__svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img"
        aria-label={model.hasData ? 'Map of incident areas and scene footprints' : 'Map with no incidents to display'}
        onMouseMove={onMove} onMouseLeave={() => setCursor(null)}>
        {lons.map((v) => { const [x] = proj(v, b.minLat); return <g key={`lo${v}`}><line className="grid-line" x1={x} x2={x} y1={0} y2={H} /><text className="grid-label" x={x + 4} y={H - 6}>{fmtLon(v)}</text></g> })}
        {lats.map((v) => { const [, y] = proj(b.minLon, v); return <g key={`la${v}`}><line className="grid-line" x1={0} x2={W} y1={y} y2={y} /><text className="grid-label" x={6} y={y - 4}>{fmtLat(v)}</text></g> })}
        {model.sceneRings.flatMap((s) => s.rings.map((r, i) => <path key={`${s.id}-${i}`} className="poly poly--scene" d={path(r)} />))}
        {model.incRings.flatMap((inc) => inc.rings.map((r, i) => (
          <path key={`${inc.id}-${i}`} className={`poly${selectedId === inc.id ? ' is-active' : ''}`} d={path(r)}
            tabIndex={onSelect ? 0 : -1} role={onSelect ? 'button' : undefined} aria-label={`Incident ${inc.name}`}
            onClick={() => onSelect?.(inc.id)} onKeyDown={(e) => { if (e.key === 'Enter') onSelect?.(inc.id) }}>
            <title>{inc.name}</title>
          </path>
        )))}
      </svg>

      <div className="map__legend" aria-hidden="true">
        <span><i style={{ background: 'rgba(240,97,109,.5)', border: '1px solid var(--err)' }} />Incident area</span>
        <span><i style={{ border: '1px dashed var(--blue)' }} />Scene footprint</span>
      </div>
      {!model.hasData && <div className="map__empty"><div>No incident geometry yet</div></div>}
      <div className="map__note">Schematic projection · no basemap tiles configured</div>
      {cursor && <div className="map__coords">{fmtLat(cursor.lat)} {fmtLon(cursor.lon)}</div>}
    </div>
  )
}
