import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { Pill } from '../StatusPill'

/** Backend value or an explicit reason it is missing. */
export const Missing = ({ children = 'Not provided by backend' }: { children?: ReactNode }) => <span className="na">{children}</span>

export function OriginTag({ origin }: { origin: 'backend' | 'browser-cached' }) {
  return origin === 'backend'
    ? <span className="src src--live" title="Read from the Varuna Netra backend">Backend data</span>
    : <span className="src src--derived" title="A summary the backend returned earlier, remembered in this browser; the backend has no endpoint to re-read it">Browser-cached</span>
}

/** Collapsed-by-default raw backend response. Only used for responses that carry no secrets. */
export function RawData({ label = 'Raw response', data }: { label?: string; data: unknown }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="raw">
      <button type="button" className="btn btn--sm" aria-expanded={open} onClick={() => setOpen((v) => !v)}>{label} <ChevronDown size={13} aria-hidden="true" className={open ? 'rot' : ''} /></button>
      {open && <pre className="raw__pre mono" tabIndex={0} aria-label={label}>{JSON.stringify(data, null, 2)}</pre>}
    </div>
  )
}

export function Scroller({ children, label }: { children: ReactNode; label: string }) {
  return <div className="table-wrap" role="region" aria-label={label} tabIndex={0}>{children}</div>
}

export const Tag = ({ children }: { children: ReactNode }) => <Pill tone="muted" flat>{children}</Pill>

export function fmt(v: number | null | undefined, d = 3): string | null {
  return typeof v === 'number' ? v.toFixed(d) : null
}
