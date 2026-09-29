import type { ReactNode } from 'react'

export type Tone = 'ok' | 'warn' | 'err' | 'active' | 'muted'

export function Pill({ tone, children, flat }: { tone: Tone; children: ReactNode; flat?: boolean }) {
  return <span className={`pill pill--${tone}${flat ? ' pill--flat' : ''}`}>{children}</span>
}

/** Maps a raw backend status string to a tone. The raw string is always what gets displayed. */
export function toneForStatus(status: string): Tone {
  const s = status.toLowerCase()
  if (['open', 'running', 'pending', 'processing', 'submitted', 'progress'].includes(s)) return 'active'
  if (['closed', 'completed', 'complete', 'done', 'success', 'ok', 'processed'].includes(s)) return 'ok'
  if (['failed', 'failure', 'error'].includes(s)) return 'err'
  return 'muted'
}

export function StatusPill({ status }: { status: string }) {
  return <Pill tone={toneForStatus(status)}>{status}</Pill>
}
