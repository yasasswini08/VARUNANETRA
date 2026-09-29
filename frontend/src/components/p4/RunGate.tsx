import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, ErrorState, SkeletonRows } from '../StateViews'
import { NeedInput } from './P4Shell'
import type { Pasha } from '../../hooks/usePasha'
import type { Workspace } from '../../hooks/useWorkspace'
import type { PashaRunResult } from '../../types/api'
import { utc } from '../investigation/parts'

/** Loading / error / empty / unavailable handling for any screen that reads a stored PASHA run. */
export function RunGate({ ws, pasha, children }: { ws: Workspace; pasha: Pasha; children: (r: PashaRunResult) => ReactNode }) {
  const { id } = ws
  if (ws.history.status === 'error') return <div className="card"><div className="card__body"><ErrorState error={ws.history.error} onRetry={ws.history.retry} title="PASHA run history could not be loaded" /></div></div>
  if (ws.history.status === 'loading' || (pasha.stored.status === 'loading' && pasha.runId && !pasha.result)) return <SkeletonRows rows={5} height={60} />
  if (!ws.drift.analysis) return <NeedInput id={id} to="m3" what="A drift analysis is needed before PASHA results can be shown." />
  if (pasha.stored.status === 'error' && !pasha.result) return <div className="card"><div className="card__body"><ErrorState error={pasha.stored.error} onRetry={pasha.stored.retry} title="PASHA result is not available" /></div></div>
  if (!pasha.result) {
    return <div className="card"><div className="card__body"><EmptyState title="PASHA result is not available" action={<Link className="btn btn--sm" to={`/investigations/${id}/pasha`}>Open PASHA Lab</Link>}>No counterfactual run is stored for this drift analysis.</EmptyState></div></div>
  }
  const rows = pasha.rows
  return (
    <>
      {rows.length > 1 && <label className="inline-field p4-runsel">Stored run<select value={pasha.runId ?? ''} onChange={(e) => pasha.select(e.target.value)}>{rows.map((r) => <option key={r.run_id} value={r.run_id}>{utc(r.created_at)} · {r.status ?? 'no status'} · {r.candidate_count} candidate(s)</option>)}</select></label>}
      {children(pasha.result)}
    </>
  )
}
