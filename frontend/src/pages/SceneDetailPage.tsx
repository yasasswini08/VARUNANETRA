import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Info } from 'lucide-react'
import { SceneMap } from '../components/SceneMap'
import { FieldGroups } from '../components/scenes/FieldGroups'
import { ErrorState, SkeletonRows } from '../components/StateViews'
import { Pill } from '../components/StatusPill'
import { useScene } from '../hooks/useScenes'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { formatDateTime, outerRings, type Ring } from '../lib/format'
import { groupsFromSearch, groupsFromStac, type FieldGroup } from '../lib/scene'
import type { Scene, SceneSearchItem, StacItem } from '../types/api'

interface NavState { row?: SceneSearchItem | Scene; source?: 'cdse' | 'persisted' }

const isSearchItem = (r: SceneSearchItem | Scene | undefined): r is SceneSearchItem => !!r && 'provenance' in r
const isPersisted = (r: SceneSearchItem | Scene | undefined): r is Scene => !!r && 'processing_status' in r

function ringsFor(item: StacItem | undefined, hint: SceneSearchItem | Scene | undefined): Ring[] {
  const g = item?.geometry ?? hint?.geometry ?? null
  const r = g ? outerRings(g) : []
  if (r.length) return r
  const b = item?.bbox ?? (isSearchItem(hint) ? hint.bbox : null)
  return b && b.length >= 4 ? [[[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]], [b[0], b[1]]]] : []
}

export default function SceneDetailPage() {
  const { sceneId = '' } = useParams()
  const id = decodeURIComponent(sceneId)
  useDocumentTitle(`Scene ${id.slice(0, 24)}`)
  const hint = (useLocation().state as NavState | null)?.row
  const scene = useScene(id)
  const navigate = useNavigate()
  const goBack = () => { if (window.history.state && window.history.state.idx > 0) navigate(-1); else navigate('/scene-explorer') }

  const groups: FieldGroup[] = []
  if (scene.status === 'success') groups.push(...groupsFromStac(scene.data))
  else if (scene.status === 'error' && isSearchItem(hint)) groups.push(...groupsFromSearch(hint))
  if (isPersisted(hint)) {
    groups.push({ title: 'Persisted record', fields: [
      { label: 'Record ID', value: hint.id }, { label: 'Provider', value: hint.provider }, { label: 'Processing status', value: hint.processing_status },
      ...(hint.incident_id ? [{ label: 'Incident', value: hint.incident_id }] : []), ...(hint.polarization ? [{ label: 'Polarization', value: hint.polarization }] : []),
    ] })
  }
  const selfLink = scene.status === 'success' ? scene.data.links?.find((l) => l.rel === 'self')?.href : undefined
  const assets = scene.status === 'success' ? Object.entries(scene.data.assets ?? {}) : []
  const rings = ringsFor(scene.status === 'success' ? scene.data : undefined, hint)
  const time = scene.status === 'success' ? String(scene.data.properties?.['datetime'] ?? '') : (hint && 'acquisition_time' in hint ? hint.acquisition_time ?? '' : '')

  return (
    <>
      <button className="link-more btn-plain back-link" onClick={goBack}><ArrowLeft size={14} /> Back to Scene Explorer</button>
      <header className="mc-head" style={{ marginTop: 14 }}>
        <div style={{ minWidth: 0 }}>
          <span className="eyebrow">Sentinel-1 scene</span>
          <h1 className="scene-title mono" style={{ marginTop: 10 }}>{id}</h1>
          {time && <p>{formatDateTime(time)} UTC</p>}
        </div>
        <button className="btn btn--primary" disabled title="Creating an investigation from a scene arrives in Phase 3">Use for investigation · P3</button>
      </header>

      {scene.status === 'loading' && <SkeletonRows rows={5} height={70} />}
      {scene.status === 'error' && (
        <div style={{ marginBottom: 16 }}>
          <ErrorState error={scene.error} onRetry={scene.retry}
            title={scene.error.reasonCode === 'PROVIDER_NOT_CONFIGURED' ? 'Provider not configured' : scene.error.reasonCode === 'PROVIDER_UNAVAILABLE' ? 'Scene not available from provider' : scene.error.isUnreachable ? undefined : 'Scene lookup failed'} />
          {groups.length > 0 && <div className="note" style={{ marginTop: 12 }}><Info aria-hidden="true" /><span>Showing the metadata carried over from the previous page instead of a fresh catalogue lookup.</span></div>}
        </div>
      )}

      {(scene.status === 'success' || groups.length > 0) && (
        <div className="sd-grid">
          <section className="card" aria-label="Scene metadata">
            <div className="card__head"><h2 className="card__title">Metadata</h2>{scene.status === 'success' ? <Pill tone="ok" flat>Live catalogue lookup</Pill> : <Pill tone="warn" flat>Cached from search</Pill>}</div>
            <div className="card__body">
              {groups.length === 0 ? <p className="hint">The catalogue returned this scene without descriptive fields.</p> : <FieldGroups groups={groups} />}
              {selfLink && <p className="hint" style={{ marginTop: 14, wordBreak: 'break-all' }}>Catalogue item: <a className="id-link" href={selfLink} target="_blank" rel="noreferrer noopener">{selfLink}</a></p>}
            </div>
          </section>
          <div className="mc-col">
            <section className="card" aria-label="Footprint"><div className="card__head"><h2 className="card__title">Footprint</h2></div>
              <div className="card__body">
                <SceneMap footprints={rings.length ? [{ id, label: id, rings }] : []} selectedId={id} compact />
                {rings.length === 0 && <p className="hint" style={{ marginTop: 8 }}>No geometry was returned for this scene.</p>}
              </div>
            </section>
            {assets.length > 0 && (
              <section className="card" aria-label="Assets"><div className="card__head"><h2 className="card__title">Catalogue assets</h2></div>
                <div className="card__body"><ul className="asset-list">{assets.map(([k, a]) => <li key={k}><span className="mono">{k}</span><small>{a.type ?? a.title ?? ''}</small></li>)}</ul>
                  <p className="hint" style={{ marginTop: 8 }}>Listed for reference. Downloads require CDSE authentication and are not offered here.</p></div>
              </section>
            )}
          </div>
        </div>
      )}
    </>
  )
}
