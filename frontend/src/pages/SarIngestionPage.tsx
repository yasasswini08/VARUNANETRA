import { useCallback, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, FileArchive, Info, UploadCloud } from 'lucide-react'
import { ApiError, ingestObservation } from '../api'
import { SceneMap } from '../components/SceneMap'
import { StepTrack, type Step } from '../components/scenes/StepTrack'
import { EmptyState, ErrorState, SkeletonRows } from '../components/StateViews'
import { Pill, StatusPill, type Tone } from '../components/StatusPill'
import { ProviderList } from '../components/mission/ProviderPanel'
import { useObservationDetail, useObservations, useProviders } from '../hooks/useMissionData'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { formatDateTime } from '../lib/format'
import { TAGLINE } from '../config/site'
import type { ObservationDetail } from '../types/api'

type Upload =
  | { phase: 'idle' }
  | { phase: 'uploading'; name: string; progress: number }
  | { phase: 'error'; name: string; error: ApiError }

const ACCEPT = '.zip,.tif,.tiff'
const STATUS_TONE: Record<string, Tone> = { ready: 'ok', metadata_incomplete: 'warn', registered_geotiff_only: 'warn', failed: 'err', uploaded: 'active' }
const STATUS_TEXT: Record<string, string> = {
  ready: 'Ready — acquisition time, footprint and polarization extracted',
  metadata_incomplete: 'Metadata incomplete — one or more required fields could not be extracted',
  registered_geotiff_only: 'Registered as GeoTIFF only — no annotation XML, so M1 detection cannot run on it',
  failed: 'Ingestion failed',
  uploaded: 'Uploaded — awaiting processing',
}

function stepsFor(up: Upload, obs: ObservationDetail | null): Step[] {
  const future = (label: string): Step => ({ label, state: 'future' })
  const uploading = up.phase === 'uploading'
  const s = obs?.status
  const extracted = !!s && s !== 'uploaded'
  return [
    { label: 'Upload', state: uploading ? 'active' : up.phase === 'error' && !obs ? 'failed' : obs ? 'done' : 'active' },
    { label: 'Extract metadata', state: s === 'failed' ? 'failed' : extracted ? 'done' : 'todo' },
    { label: 'Validate scene', state: s === 'ready' ? 'done' : s === 'metadata_incomplete' || s === 'registered_geotiff_only' ? 'warn' : s === 'failed' ? 'failed' : 'todo' },
    future('Fetch environmental data'), future('Create investigation'), future('Start analysis'),
  ]
}

function MetaRow({ k, v }: { k: string; v: string | null | undefined }) {
  return <div className="fields__row"><dt>{k}</dt><dd className="mono">{v ? v : <span className="muted">Not extracted</span>}</dd></div>
}

export default function SarIngestionPage() {
  useDocumentTitle('SAR Ingestion')
  const [up, setUp] = useState<Upload>({ phase: 'idle' })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [drag, setDrag] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const list = useObservations()
  const detail = useObservationDetail(selectedId)
  const providers = useProviders()
  const obs = detail.status === 'success' ? detail.data : null

  const start = useCallback((file: File | undefined) => {
    if (!file) return
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
    if (!['.zip', '.tif', '.tiff'].includes(ext)) {
      setUp({ phase: 'error', name: file.name, error: new ApiError('http', `Unsupported file type "${ext || 'none'}". Upload a zipped Sentinel-1 SAFE product (.zip) or a GeoTIFF (.tif / .tiff).`, 422) })
      return
    }
    setUp({ phase: 'uploading', name: file.name, progress: 0 })
    ingestObservation(file, (f) => setUp({ phase: 'uploading', name: file.name, progress: f })).then(
      (r) => { setUp({ phase: 'idle' }); setSelectedId(r.observation_id); list.retry() },
      (err: unknown) => {
        setUp({ phase: 'error', name: file.name, error: err instanceof ApiError ? err : new ApiError('network', 'Backend connection unavailable') })
        list.retry() // the backend persists failed ingests too
      },
    )
  }, [list])

  const warnings = obs?.extraction_diagnostics?.warnings ?? []
  const bbox = obs?.bbox ?? null
  const footprint = bbox ? [{ id: obs?.id ?? 'obs', label: obs?.product_id ?? 'Observation', rings: [[[bbox[0], bbox[1]], [bbox[2], bbox[1]], [bbox[2], bbox[3]], [bbox[0], bbox[3]], [bbox[0], bbox[1]]] as [number, number][]] }] : []
  const observations = list.data?.observations ?? []
  const uploading = up.phase === 'uploading'

  return (
    <>
      <header className="mc-head">
        <div>
          <span className="eyebrow">{TAGLINE}</span>
          <h1 style={{ marginTop: 10 }}>SAR Ingestion</h1>
          <p>Upload a Sentinel-1 product and review the metadata the backend extracts from it.</p>
        </div>
        <Link to="/scene-explorer" className="btn">Find scenes in the archive <ArrowRight size={15} /></Link>
      </header>

      <div className="card" style={{ marginBottom: 16 }}><div className="card__body"><StepTrack label="Ingestion progress" steps={stepsFor(up, obs)} /></div></div>

      <div className="ing-grid">
        <div className="mc-col">
          <section className="card" aria-label="Upload SAR observation">
            <div className="card__head"><h2 className="card__title">Upload SAR observation</h2></div>
            <div className="card__body">
              <div className={`dropzone${drag ? ' is-drag' : ''}${uploading ? ' is-busy' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); if (!uploading) start(e.dataTransfer.files[0]) }}>
                <UploadCloud aria-hidden="true" />
                <strong>Drag &amp; drop a SAR file here</strong>
                <span className="hint">or</span>
                <input ref={input} type="file" accept={ACCEPT} hidden onChange={(e) => { start(e.target.files?.[0]); e.target.value = '' }} aria-label="Choose SAR file" />
                <button className="btn btn--primary" disabled={uploading} onClick={() => input.current?.click()}>Choose file</button>
                <span className="hint">Accepted: zipped Sentinel-1 GRD SAFE product (.zip) or GeoTIFF (.tif, .tiff)</span>
              </div>
              {uploading && (
                <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(up.progress * 100)} aria-label={`Uploading ${up.name}`}>
                  <div className="progress__bar" style={{ width: `${Math.round(up.progress * 100)}%` }} />
                  <span className="mono">{up.name} · {up.progress >= 1 ? 'processing on server…' : `${Math.round(up.progress * 100)}%`}</span>
                </div>
              )}
              {up.phase === 'error' && (
                <div style={{ marginTop: 12 }}>
                  <ErrorState compact error={up.error} onRetry={() => setUp({ phase: 'idle' })} title={up.error.reasonCode === 'INGESTION_FAILED' ? 'Ingestion failed' : up.error.isUnreachable ? undefined : 'Upload rejected'} />
                  <p className="hint" style={{ textAlign: 'center' }}>File: <span className="mono">{up.name}</span></p>
                </div>
              )}
            </div>
          </section>

          <section className="card" aria-label="Processing status">
            <div className="card__head"><h2 className="card__title">Processing status</h2></div>
            <div className="card__body">
              {obs ? (
                <div className={`callout callout--${STATUS_TONE[obs.status] ?? 'muted'}`} role="status">
                  <StatusPill status={obs.status} /><span>{STATUS_TEXT[obs.status] ?? obs.status}</span>
                </div>
              ) : uploading ? <div className="callout callout--active" role="status">Uploading {up.name}…</div>
                : <div className="callout callout--muted" role="status"><Info size={15} aria-hidden="true" /> Upload a SAR file, or select an earlier upload below, to see its processing status.</div>}
              {obs?.error_message && <div className="form-error" role="alert" style={{ marginTop: 10 }}>{obs.error_message}</div>}
              {warnings.length > 0 && (
                <ul className="warn-list" aria-label="Extraction warnings">{warnings.map((w, i) => <li key={i}><AlertTriangle size={14} aria-hidden="true" />{w}</li>)}</ul>
              )}
            </div>
          </section>
        </div>

        <div className="mc-col">
          <section className="card" aria-label="Extracted metadata">
            <div className="card__head"><h2 className="card__title">Extracted metadata</h2>{obs && <Pill tone={STATUS_TONE[obs.status] ?? 'muted'} flat>{obs.status}</Pill>}</div>
            <div className="card__body">
              {!selectedId && <EmptyState title="Nothing selected">Metadata appears here after an upload, or when you select an earlier observation.</EmptyState>}
              {selectedId && detail.status === 'loading' && <SkeletonRows rows={6} height={30} />}
              {selectedId && detail.status === 'error' && <ErrorState error={detail.error} onRetry={detail.retry} compact />}
              {obs && (
                <>
                  <dl className="fields">
                    <MetaRow k="File" v={obs.original_filename} /><MetaRow k="File kind" v={obs.file_kind} />
                    <MetaRow k="Sensor" v={obs.sensor} /><MetaRow k="Product ID" v={obs.product_id} /><MetaRow k="Product type" v={obs.product_type} />
                    <MetaRow k="Acquisition time" v={obs.acquisition_time ? `${formatDateTime(obs.acquisition_time)} UTC` : null} />
                    <MetaRow k="Polarization" v={obs.polarization} />
                    <MetaRow k="Extent (lon, lat)" v={bbox ? `${bbox[0].toFixed(3)}, ${bbox[1].toFixed(3)} → ${bbox[2].toFixed(3)}, ${bbox[3].toFixed(3)}` : null} />
                    <MetaRow k="Uploaded" v={`${formatDateTime(obs.created_at)}`} />
                    <MetaRow k="Observation ID" v={obs.id} />
                  </dl>
                  <div style={{ marginTop: 14 }}><SceneMap footprints={footprint} selectedId={footprint[0]?.id} compact /></div>
                </>
              )}
            </div>
          </section>

          <section className="card" aria-label="Next steps">
            <div className="card__head"><h2 className="card__title">Next steps</h2></div>
            <div className="card__body">
              <ol className="next">
                <li><span>1</span>Review the extracted metadata</li>
                <li><span>2</span>Confirm the footprint is the expected area</li>
                <li><span>3</span><Link to="/investigations/new" className="link-more">Create an investigation from this observation <ArrowRight size={13} /></Link></li>
                <li><span>4</span>Run M1–M4 in the workspace: detection, environment, drift, vessels</li>
              </ol>
            </div>
          </section>
        </div>
      </div>

      <div className="ing-grid" style={{ marginTop: 16 }}>
        <section className="card" aria-label="Uploaded observations">
          <div className="card__head"><h2 className="card__title">Uploaded observations{list.status === 'success' && <span className="count"> ({observations.length})</span>}</h2></div>
          <div className="card__body">
            {list.status === 'loading' && <SkeletonRows rows={4} />}
            {list.status === 'error' && <ErrorState error={list.error} onRetry={list.retry} compact />}
            {list.status === 'success' && observations.length === 0 && <EmptyState title="No observations yet">Uploaded SAR products will be listed here.</EmptyState>}
            {list.status === 'success' && observations.length > 0 && (
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>File</th><th>Product</th><th>Acquired</th><th>Pol.</th><th>Status</th><th><span className="sr-only">Action</span></th></tr></thead>
                  <tbody>
                    {observations.slice(0, 12).map((o) => (
                      <tr key={o.id} style={selectedId === o.id ? { background: 'var(--primary-dim)' } : undefined}>
                        <td className="file-cell"><FileArchive size={14} aria-hidden="true" /> <span title={o.original_filename ?? ''}>{o.original_filename ?? '—'}</span></td>
                        <td className="mono">{o.product_type ?? '—'}</td>
                        <td className="mono">{o.acquisition_time ? formatDateTime(o.acquisition_time) : '—'}</td>
                        <td className="mono">{o.polarization ?? '—'}</td>
                        <td><StatusPill status={o.status} /></td>
                        <td><button className="btn btn--sm" aria-pressed={selectedId === o.id} onClick={() => setSelectedId(o.id)}>Inspect</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
        <section className="card" aria-label="Data providers">
          <div className="card__head"><h2 className="card__title">Data providers</h2></div>
          <div className="card__body"><ProviderList state={providers} retry={providers.retry} /></div>
        </section>
      </div>
    </>
  )
}
