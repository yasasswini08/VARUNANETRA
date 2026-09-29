import type { StageState } from './investigation'
import type { Tone } from '../components/StatusPill'

/** One vocabulary for state across the whole app. */
export type Canon = 'ready' | 'running' | 'complete' | 'failed' | 'unavailable' | 'not-executed' | 'demo' | 'live'

export const CANON: Record<Canon, { label: string; tone: Tone; flat?: boolean; hint: string }> = {
  ready: { label: 'READY', tone: 'active', hint: 'Prerequisites are met; the step has not been run' },
  running: { label: 'RUNNING', tone: 'active', hint: 'A request is in flight on the backend' },
  complete: { label: 'COMPLETE', tone: 'ok', hint: 'The backend holds a result for this step' },
  failed: { label: 'FAILED', tone: 'err', hint: 'The backend reported an error for this step' },
  unavailable: { label: 'UNAVAILABLE', tone: 'warn', hint: 'The backend cannot provide this (missing provider, data or capability)' },
  'not-executed': { label: 'NOT EXECUTED', tone: 'muted', flat: true, hint: 'No stored result exists; this does not mean the step failed' },
  demo: { label: 'DEMO', tone: 'warn', hint: 'Illustrative presentation content, not backend data' },
  live: { label: 'LIVE', tone: 'ok', hint: 'Read from the Varuna Netra backend' },
}

export const canonForStage = (s: StageState): Canon =>
  s === 'completed' ? 'complete' : s === 'locked' ? 'not-executed' : s

/** Timestamps from the backend are UTC even when naive; used for sorting only. */
export const ts = (iso: string | null | undefined): number => {
  if (!iso) return NaN
  return new Date(/(Z|[+-]\d{2}:?\d{2})$/.test(iso) ? iso : `${iso}Z`).getTime()
}
