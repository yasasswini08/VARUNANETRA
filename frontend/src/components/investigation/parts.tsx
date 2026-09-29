import type { ReactNode } from 'react'
import { Loader2, Lock } from 'lucide-react'
import type { ApiError } from '../../api/client'
import { ErrorState } from '../StateViews'
import { CanonStatus } from '../CanonStatus'
import { Pill } from '../StatusPill'
import { formatDateTime } from '../../lib/format'
import type { StageState } from '../../lib/investigation'
import { canonForStage } from '../../lib/status'
import type { ProvenanceDump } from '../../types/api'

export const StageBadge = ({ state }: { state: StageState }) => <CanonStatus s={canonForStage(state)} />

export function Kv({ rows }: { rows: [string, ReactNode | null | undefined][] }) {
  const shown = rows.filter(([, v]) => v !== null && v !== undefined && v !== '')
  return <dl className="fields">{shown.map(([k, v]) => <div className="fields__row" key={k}><dt>{k}</dt><dd className="mono">{v}</dd></div>)}</dl>
}

export const utc = (iso: string | null | undefined) => (iso ? `${formatDateTime(iso)} UTC` : null)
export const num = (v: number | null | undefined, d = 2) => (v === null || v === undefined ? '—' : v.toFixed(d))

/** Every field comes straight from the backend's Provenance model; nothing is added. */
export function ProvenanceBlock({ title, p, cached }: { title: string; p: ProvenanceDump; cached?: boolean }) {
  const params = p.parameters && Object.keys(p.parameters).length ? JSON.stringify(p.parameters) : null
  return (
    <div className="prov-block">
      <h4>{title}{cached && <Pill tone="muted" flat>browser-cached</Pill>}</h4>
      <Kv rows={[
        ['Data kind', p.kind], ['Source', p.source], ['Dataset', p.dataset], ['Variable', p.variable], ['Product ID', p.product_id],
        ['Window start', utc(p.time_start)], ['Window end', utc(p.time_end)],
        ['Extent', p.bbox && p.bbox.length >= 4 ? p.bbox.slice(0, 4).map((n) => n.toFixed(3)).join(', ') : null],
        ['Retrieved at', utc(p.retrieved_at)], ['Processing version', p.processing_version], ['Model version', p.model_version],
        ['Parameters', params], ['Notes', p.notes], ['Source URL', p.source_url],
      ]} />
    </div>
  )
}

const HINTS: Record<string, string> = {
  PROVIDER_NOT_CONFIGURED: 'The backend has no credentials for this provider. Add them to the backend .env and restart the stack; there is no synthetic fallback.',
  PROVIDER_UNAVAILABLE: 'The upstream provider returned an error. Retry later; nothing was generated in its place.',
  INSUFFICIENT_DATA: 'The backend does not hold the input this step needs. Check the message above for what is missing.',
  INVALID_GEOMETRY: 'The geometry sent to the backend was rejected.',
  SIMULATION_FAILURE: 'The drift simulation failed inside the backend.',
  INGESTION_FAILED: 'The SAR product could not be ingested.',
}
export function OpError({ error, onRetry, title }: { error: ApiError; onRetry: () => void; title: string }) {
  const hint = error.reasonCode ? HINTS[error.reasonCode] : error.status && error.status >= 500 ? 'The backend failed while processing this request.' : undefined
  return (
    <div>
      <ErrorState compact error={error} onRetry={onRetry} title={error.isUnreachable ? undefined : title} />
      {hint && <p className="hint" style={{ textAlign: 'center' }}>{hint}</p>}
    </div>
  )
}

export function RunButton({ busy, disabled, onClick, children, why }: { busy: boolean; disabled?: boolean; onClick: () => void; children: ReactNode; why?: string }) {
  return (
    <button type="button" className="btn btn--primary" disabled={busy || disabled} onClick={onClick} title={disabled ? why : undefined} aria-busy={busy}>
      {busy ? <Loader2 size={15} className="spin" aria-hidden="true" /> : null}{children}
    </button>
  )
}

export function Busy({ children }: { children: ReactNode }) {
  return <div className="callout callout--active" role="status"><Loader2 size={15} className="spin" aria-hidden="true" /><span>{children}</span></div>
}

export function LockedNote({ children }: { children: ReactNode }) {
  return <div className="callout callout--muted" role="status"><Lock size={15} aria-hidden="true" /><span>{children}</span></div>
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return <section className="mod-sec"><div className="mod-sec__head"><h3>{title}</h3>{aside}</div>{children}</section>
}
