import { CANON, type Canon } from '../lib/status'
import { Pill } from './StatusPill'

/** The single visual treatment for READY / RUNNING / COMPLETE / FAILED / UNAVAILABLE / NOT EXECUTED / DEMO / LIVE. */
export function CanonStatus({ s, label }: { s: Canon; label?: string }) {
  const c = CANON[s]
  return <span title={c.hint}><Pill tone={c.tone} flat={c.flat}>{label ?? c.label}</Pill></span>
}
