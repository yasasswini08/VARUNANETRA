import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, FileArchive, UploadCloud } from 'lucide-react'
import { SceneMap, type Bbox } from '../components/SceneMap'
import { EmptyState, ErrorState, SkeletonRows } from '../components/StateViews'
import { OpError, RunButton } from '../components/investigation/parts'
import { useCreateInvestigation } from '../hooks/useInvestigation'
import { useObservations } from '../hooks/useMissionData'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { formatDateTime } from '../lib/format'
import { bboxRing } from '../lib/projection'
import { TAGLINE } from '../config/site'

type Mode = 'observation' | 'area'
const EMPTY = { minlon: '', minlat: '', maxlon: '', maxlat: '' }

export default function NewInvestigationPage() {
  useDocumentTitle('New Investigation')
  const navigate = useNavigate()
  const obs = useObservations()
  const create = useCreateInvestigation()
  const [mode, setMode] = useState<Mode>('observation')
  const [pick, setPick] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [box, setBox] = useState(EMPTY)

  const ready = (obs.data?.observations ?? []).filter((o) => o.status === 'ready' && o.product_id && o.bbox)
  const chosen = ready.find((o) => o.id === pick) ?? null
  const nums = useMemo(() => ({ minlon: Number(box.minlon), minlat: Number(box.minlat), maxlon: Number(box.maxlon), maxlat: Number(box.maxlat) }), [box])
  const filled = Object.values(box).every((v) => v.trim() !== '')
  const boxError = !filled ? null
    : Object.values(nums).some((n) => !Number.isFinite(n)) ? 'Coordinates must be numbers.'
    : nums.minlon < -180 || nums.maxlon > 180 || nums.minlat < -90 || nums.maxlat > 90 ? 'Longitude must be within ±180 and latitude within ±90.'
    : nums.minlon >= nums.maxlon || nums.minlat >= nums.maxlat ? 'Minimum values must be smaller than maximum values.' : null
  const aoi: Bbox | null = filled && !boxError ? nums : null
  const finalName = name.trim() || (mode === 'observation' && chosen ? `Investigation - ${chosen.product_id}` : '')
  const canCreate = finalName !== '' && (mode === 'observation' ? !!chosen : !!aoi)

  const submit = async () => {
    const b = mode === 'observation' && chosen?.bbox ? { minlon: chosen.bbox[0], minlat: chosen.bbox[1], maxlon: chosen.bbox[2], maxlat: chosen.bbox[3] } : aoi
    if (!b) return
    const r = await create.run({ name: finalName, ...b }, mode === 'observation' ? chosen?.id ?? null : null)
    if (r) navigate(`/investigations/${r.id}/m1`)
  }
  const fp = chosen?.bbox ? [{ id: chosen.id, label: chosen.product_id ?? 'Observation', rings: [bboxRing(chosen.bbox)] }] : []

  return (
    <>
      <header className="mc-head">
        <div>
          <span className="eyebrow">{TAGLINE}</span>
          <h1 style={{ marginTop: 10 }}>New Investigation</h1>
          <p>An investigation is an incident record. Link an ingested SAR observation now, or define an area and attach one later.</p>
        </div>
      </header>

      <div className="seg" role="tablist" aria-label="Investigation source" style={{ marginBottom: 16 }}>
        <button role="tab" aria-selected={mode === 'observation'} onClick={() => setMode('observation')}>From SAR observation</button>
        <button role="tab" aria-selected={mode === 'area'} onClick={() => setMode('area')}>From area of interest</button>
      </div>

      <div className="ing-grid">
        <section className="card" aria-label="Investigation input">
          <div className="card__head"><h2 className="card__title">{mode === 'observation' ? 'Select a SAR observation' : 'Define the area'}</h2></div>
          <div className="card__body">
            {mode === 'observation' ? (
              <>
                {obs.status === 'loading' && <SkeletonRows rows={4} />}
                {obs.status === 'error' && <ErrorState error={obs.error} onRetry={obs.retry} compact />}
                {obs.status === 'success' && ready.length === 0 && (
                  <EmptyState title="No ready observations" action={<Link to="/sar-ingestion" className="btn btn--sm"><UploadCloud size={14} /> Ingest a SAR product</Link>}>Only observations with extracted product ID, footprint and acquisition time can start an investigation.</EmptyState>
                )}
                {ready.length > 0 && (
                  <div className="table-wrap"><table className="tbl">
                    <caption className="sr-only">Ready observations</caption>
                    <thead><tr><th><span className="sr-only">Select</span></th><th>File</th><th>Acquired</th><th>Pol.</th><th>Linked</th></tr></thead>
                    <tbody>{ready.map((o) => (
                      <tr key={o.id} style={pick === o.id ? { background: 'var(--primary-dim)' } : undefined}>
                        <td><input type="radio" name="obs" className="radio" checked={pick === o.id} onChange={() => setPick(o.id)} aria-label={`Select ${o.original_filename ?? o.id}`} /></td>
                        <td className="file-cell"><FileArchive size={14} aria-hidden="true" /> <span title={o.original_filename ?? ''}>{o.original_filename ?? '—'}</span></td>
                        <td className="mono">{o.acquisition_time ? formatDateTime(o.acquisition_time) : '—'}</td><td className="mono">{o.polarization ?? '—'}</td>
                        <td>{o.incident_id ? <Link className="id-link" to={`/investigations/${o.incident_id}`}>{o.incident_id.slice(0, 8)}</Link> : '—'}</td>
                      </tr>
                    ))}</tbody>
                  </table></div>
                )}
                {chosen?.incident_id && <p className="hint" style={{ marginTop: 10 }}>This observation is already linked to another investigation; creating a new one will move the link.</p>}
              </>
            ) : (
              <>
                <fieldset className="form-stack">
                  <legend>Bounding box (degrees)</legend>
                  <div className="grid-4">
                    {(['minlon', 'minlat', 'maxlon', 'maxlat'] as const).map((k) => (
                      <label key={k}>{k}<input inputMode="decimal" value={box[k]} onChange={(e) => setBox({ ...box, [k]: e.target.value })} /></label>
                    ))}
                  </div>
                  {boxError && <div className="form-error" role="alert">{boxError}</div>}
                </fieldset>
                <div style={{ marginTop: 14 }}><SceneMap footprints={[]} aoi={aoi} compact onDrawAoi={(b) => setBox({ minlon: b.minlon.toFixed(4), minlat: b.minlat.toFixed(4), maxlon: b.maxlon.toFixed(4), maxlat: b.maxlat.toFixed(4) })} /></div>
              </>
            )}
          </div>
        </section>

        <section className="card" aria-label="Create investigation">
          <div className="card__head"><h2 className="card__title">Create</h2></div>
          <div className="card__body form-stack">
            <label>Investigation name<input value={name} onChange={(e) => setName(e.target.value)} placeholder={mode === 'observation' && chosen ? `Investigation - ${chosen.product_id}` : 'e.g. Ennore Port slick'} maxLength={120} /></label>
            {mode === 'observation' && chosen?.bbox && <SceneMap footprints={fp} selectedId={chosen.id} compact />}
            <RunButton busy={create.state.status === 'running'} disabled={!canCreate} why="Choose an input and a name" onClick={() => void submit()}>Create investigation <ArrowRight size={15} /></RunButton>
            {create.state.status === 'error' && <OpError error={create.state.error} onRetry={() => void submit()} title="Could not create investigation" />}
            <ol className="next">
              <li><span>1</span>Incident record is created in the backend</li>
              <li><span>2</span>M1 detects slick candidates in the linked SAR scene</li>
              <li><span>3</span>M2 retrieves ERA5 / CMEMS context, M3 reconstructs drift</li>
              <li><span>4</span>M4 correlates AIS vessels with the reconstructed origin</li>
            </ol>
          </div>
        </section>
      </div>
    </>
  )
}
