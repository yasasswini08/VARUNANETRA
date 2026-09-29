import { useMemo, useState } from 'react'
import { Crosshair } from 'lucide-react'
import { fmtLat, fmtLon, type Ring } from '../../lib/format'
import { decimate, makeProjection, MAP_H, MAP_W, niceStep } from '../../lib/projection'

export interface MapPoint { id: string; label: string; lon: number; lat: number }
export interface MapLayers {
  incident: Ring[]
  scene: Ring[]
  slick: Ring[]
  /** Requested extent of the environmental query (the backend returns no gridded values to draw). */
  env: Ring[]
  origin: Ring[]
  originCentroid: { lon: number; lat: number } | null
  uncertaintyKm: number | null
  forecasts: { label: string; rings: Ring[]; centroid: { lon: number; lat: number } }[]
  vessels: MapPoint[]
  /** Phase 4: candidate release positions taken from PASHA hypotheses (backend best_fit_position). */
  counterfactual?: MapPoint[]
  selectedId?: string | null
}
type LayerKey = 'incident' | 'scene' | 'slick' | 'env' | 'drift' | 'vessels' | 'cf'

const META: { key: LayerKey; label: string; swatch: string }[] = [
  { key: 'incident', label: 'Incident area', swatch: 'var(--err)' },
  { key: 'scene', label: 'SAR scene', swatch: 'var(--blue)' },
  { key: 'slick', label: 'Detected slick', swatch: '#ff8a5c' },
  { key: 'env', label: 'Forcing extent', swatch: 'var(--muted)' },
  { key: 'drift', label: 'Drift', swatch: 'var(--primary)' },
  { key: 'vessels', label: 'Vessels', swatch: 'var(--warn)' },
  { key: 'cf', label: 'Counterfactual source', swatch: 'var(--cf)' },
]

const has = (l: MapLayers): Record<LayerKey, boolean> => ({
  incident: l.incident.length > 0, scene: l.scene.length > 0, slick: l.slick.length > 0, env: l.env.length > 0,
  drift: l.origin.length > 0 || !!l.originCentroid || l.forecasts.length > 0, vessels: l.vessels.length > 0, cf: (l.counterfactual?.length ?? 0) > 0,
})

/** Schematic equirectangular map of the investigation's real geometry. No basemap is configured, so none is drawn. */
export function InvestigationMap({ layers }: { layers: MapLayers }) {
  const avail = has(layers)
  const [off, setOff] = useState<Partial<Record<LayerKey, boolean>>>({})
  const [focus, setFocus] = useState(true)
  const [cursor, setCursor] = useState<{ lat: number; lon: number } | null>(null)
  const on = (k: LayerKey) => avail[k] && !off[k]
  const canFocus = avail.slick || avail.drift || avail.vessels

  const m = useMemo(() => {
    const focusPts: [number, number][] = [
      ...layers.slick.flat(), ...layers.origin.flat(), ...layers.forecasts.flatMap((f) => f.rings.flat()),
      ...layers.vessels.map((v) => [v.lon, v.lat] as [number, number]),
      ...(layers.counterfactual ?? []).map((v) => [v.lon, v.lat] as [number, number]),
    ]
    if (layers.originCentroid) focusPts.push([layers.originCentroid.lon, layers.originCentroid.lat])
    const allPts: [number, number][] = [...focusPts, ...layers.incident.flat(), ...layers.scene.flat(), ...layers.env.flat()]
    return makeProjection(focus && focusPts.length ? focusPts : allPts)
  }, [layers, focus])

  const { b, proj, inv, scale } = m
  const lonStep = niceStep(b.maxlon - b.minlon), latStep = niceStep(b.maxlat - b.minlat)
  const lons: number[] = [], lats: number[] = []
  for (let v = Math.ceil(b.minlon / lonStep) * lonStep; v <= b.maxlon; v += lonStep) lons.push(v)
  for (let v = Math.ceil(b.minlat / latStep) * latStep; v <= b.maxlat; v += latStep) lats.push(v)
  const path = (r: Ring) => decimate(r).map(([lo, la], i) => `${i ? 'L' : 'M'}${proj(lo, la).map((n) => n.toFixed(1)).join(' ')}`).join(' ') + 'Z'

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const sc = Math.min(r.width / MAP_W, r.height / MAP_H)
    const [lon, lat] = inv((e.clientX - r.left - (r.width - MAP_W * sc) / 2) / sc, (e.clientY - r.top - (r.height - MAP_H * sc) / 2) / sc)
    setCursor({ lon, lat })
  }
  const summary = META.filter((x) => on(x.key)).map((x) => x.label).join(', ') || 'no data layers'
  const oc = layers.originCentroid ? proj(layers.originCentroid.lon, layers.originCentroid.lat) : null

  return (
    <div>
      <div className="map map--inv">
        <svg className="map__svg" viewBox={`0 0 ${MAP_W} ${MAP_H}`} preserveAspectRatio="xMidYMid meet" role="img"
          aria-label={`Investigation map showing ${summary}`} onPointerMove={onMove} onPointerLeave={() => setCursor(null)}>
          {lons.map((v) => { const [x] = proj(v, b.minlat); return <g key={`lo${v}`}><line className="grid-line" x1={x} x2={x} y1={0} y2={MAP_H} /><text className="grid-label" x={x + 4} y={MAP_H - 6}>{fmtLon(v)}</text></g> })}
          {lats.map((v) => { const [, y] = proj(b.minlon, v); return <g key={`la${v}`}><line className="grid-line" x1={0} x2={MAP_W} y1={y} y2={y} /><text className="grid-label" x={6} y={y - 4}>{fmtLat(v)}</text></g> })}
          {on('incident') && layers.incident.map((r, i) => <path key={`i${i}`} className="lyr lyr--incident" d={path(r)} />)}
          {on('scene') && layers.scene.map((r, i) => <path key={`s${i}`} className="lyr lyr--scene" d={path(r)} />)}
          {on('env') && layers.env.map((r, i) => <path key={`e${i}`} className="lyr lyr--env" d={path(r)} />)}
          {on('drift') && layers.origin.map((r, i) => <path key={`o${i}`} className="lyr lyr--origin" d={path(r)}><title>Probable origin region (50% highest-density)</title></path>)}
          {on('drift') && layers.forecasts.map((f) => f.rings.map((r, i) => <path key={`${f.label}${i}`} className="lyr lyr--fc" d={path(r)}><title>Forecast {f.label}</title></path>))}
          {on('drift') && oc && layers.uncertaintyKm !== null && <circle className="lyr lyr--unc" cx={oc[0]} cy={oc[1]} r={(layers.uncertaintyKm / 111.32) * scale}><title>{`Origin uncertainty ${layers.uncertaintyKm} km`}</title></circle>}
          {on('drift') && oc && <g className="pt pt--origin"><circle cx={oc[0]} cy={oc[1]} r={5} /><text x={oc[0] + 9} y={oc[1] + 4}>origin</text></g>}
          {on('drift') && layers.forecasts.map((f) => { const [x, y] = proj(f.centroid.lon, f.centroid.lat); return <g key={`c${f.label}`} className="pt pt--fc"><circle cx={x} cy={y} r={3.5} /><text x={x + 7} y={y + 4}>{f.label}</text></g> })}
          {on('slick') && layers.slick.map((r, i) => <path key={`k${i}`} className="lyr lyr--slick" d={path(r)}><title>Detected slick</title></path>)}
          {on('vessels') && layers.vessels.map((v) => { const [x, y] = proj(v.lon, v.lat); return <g key={v.id} className={`pt pt--vessel${layers.selectedId === v.id ? ' is-selected' : ''}`}><circle cx={x} cy={y} r={layers.selectedId === v.id ? 7 : 5}><title>{v.label}</title></circle><text x={x + 8} y={y + 4}>{v.label}</text></g> })}
          {on('cf') && (layers.counterfactual ?? []).map((v) => { const [x, y] = proj(v.lon, v.lat); return <g key={`cf${v.id}`} className={`pt pt--cf${layers.selectedId === v.id ? ' is-selected' : ''}`}><rect x={x - 5} y={y - 5} width={10} height={10} transform={`rotate(45 ${x} ${y})`}><title>{`Counterfactual source: ${v.label}`}</title></rect><text x={x + 9} y={y + 4}>{v.label}</text></g> })}
        </svg>
        {summary === 'no data layers' && <div className="map__empty"><div>No geometry yet</div></div>}
        <div className="map__note"><Crosshair size={11} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 5 }} />Schematic projection · no basemap or imagery configured</div>
        {cursor && <div className="map__coords">{fmtLat(cursor.lat)} {fmtLon(cursor.lon)}</div>}
      </div>
      <div className="layerbar" role="group" aria-label="Map layers">
        {META.map((x) => (
          <button key={x.key} type="button" className={`chip${on(x.key) ? ' is-on' : ''}`} disabled={!avail[x.key]} aria-pressed={on(x.key)}
            title={avail[x.key] ? undefined : 'No backend data for this layer yet'} onClick={() => setOff((o) => ({ ...o, [x.key]: !o[x.key] }))}>
            <i style={{ background: x.swatch }} aria-hidden="true" />{x.label}{!avail[x.key] && <small> · no data</small>}
          </button>
        ))}
        {canFocus && (
          <div className="seg layerbar__view" role="group" aria-label="Map extent">
            <button type="button" aria-pressed={focus} className={focus ? 'is-on' : ''} onClick={() => setFocus(true)}>Focus</button>
            <button type="button" aria-pressed={!focus} className={!focus ? 'is-on' : ''} onClick={() => setFocus(false)}>Full area</button>
          </div>
        )}
      </div>
    </div>
  )
}
