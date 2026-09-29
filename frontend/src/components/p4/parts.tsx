import type { ReactNode } from 'react'
import { Check, X } from 'lucide-react'
import { Pill, type Tone } from '../StatusPill'
import { ProvenanceBlock } from '../investigation/parts'
import type { ProvenanceDump } from '../../types/api'

export type Source = 'live' | 'derived' | 'unavailable'
const SRC: Record<Source, { label: string; title: string }> = {
  live: { label: 'Backend data', title: 'Returned by the Varuna Netra backend' },
  derived: { label: 'Derived in browser', title: 'Computed in the browser from backend-returned values; not a backend result' },
  unavailable: { label: 'Unavailable', title: 'The backend did not return this' },
}
export const SourceTag = ({ kind }: { kind: Source }) => <span className={`src src--${kind}`} title={SRC[kind].title}>{SRC[kind].label}</span>

/** Human-readable reason shown wherever a field is missing, instead of a bare dash. */
export const Na = ({ why = 'Not provided' }: { why?: string }) => <span className="na">{why}</span>

export function KvU({ rows }: { rows: [string, ReactNode | null | undefined, string?][] }) {
  return (
    <dl className="fields">
      {rows.map(([k, v, why]) => {
        const has = v !== null && v !== undefined && v !== ''
        return <div className="fields__row" key={k}><dt>{k}</dt><dd className={has ? 'mono' : undefined}>{has ? v : <Na why={why} />}</dd></div>
      })}
    </dl>
  )
}

/** Thin bar for a backend score. Width is the raw value clamped to 0–1; the number is always printed beside it. */
export function Meter({ label, value, hint }: { label: string; value: number | null | undefined; hint?: string }) {
  const has = typeof value === 'number'
  return (
    <div className="meter">
      <div className="meter__row"><span>{label}</span>{has ? <span className="mono">{value.toFixed(4)}</span> : <Na why="Not returned" />}</div>
      <div className="meter__bar" aria-hidden="true"><i style={{ width: has ? `${Math.max(0, Math.min(1, value)) * 100}%` : 0 }} /></div>
      {hint && <small>{hint}</small>}
    </div>
  )
}

export const Gate = ({ label, pass }: { label: string; pass: boolean | undefined }) => (
  <li className={`gate gate--${pass === undefined ? 'na' : pass ? 'pass' : 'fail'}`}>
    {pass === undefined ? <span className="gate__ico">–</span> : pass ? <Check size={14} aria-hidden="true" /> : <X size={14} aria-hidden="true" />}
    <span>{label}</span><strong>{pass === undefined ? 'Not computed' : pass ? 'Passed' : 'Failed'}</strong>
  </li>
)

export function Expand({ title, children, open }: { title: ReactNode; children: ReactNode; open?: boolean }) {
  return <details className="expand" open={open}><summary>{title}</summary><div className="expand__body">{children}</div></details>
}

export function ProvPanel({ title, items }: { title: string; items: { title: string; p: ProvenanceDump | undefined | null }[] }) {
  const have = items.filter((i): i is { title: string; p: ProvenanceDump } => !!i.p)
  return (
    <Expand title={<>{title} <SourceTag kind={have.length ? 'live' : 'unavailable'} /></>}>
      {have.length === 0 ? <p className="hint">No provenance block is available for this result.</p> : <div className="prov-grid">{have.map((i) => <ProvenanceBlock key={i.title} {...i} />)}</div>}
    </Expand>
  )
}

export function statusTone(s: string | null | undefined): Tone {
  switch ((s ?? '').toUpperCase()) {
    case 'LEADING': return 'ok'
    case 'SECONDARY': case 'AMBIGUOUS': return 'warn'
    case 'REJECTED': return 'err'
    default: return 'muted'
  }
}
/** Backend status string, verbatim. */
export const BackendStatus = ({ status }: { status: string | null | undefined }) => status ? <Pill tone={statusTone(status)}>{status}</Pill> : <Na why="No status returned" />
