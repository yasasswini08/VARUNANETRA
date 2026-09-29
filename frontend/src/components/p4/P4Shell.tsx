import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { EmptyState, ErrorState, SkeletonRows } from '../StateViews'
import { StatusPill } from '../StatusPill'
import { Kv, StageBadge, utc } from '../investigation/parts'
import type { StageState } from '../../lib/investigation'
import type { Workspace } from '../../hooks/useWorkspace'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { TAGLINE } from '../../config/site'

export function m5State(ws: Workspace, override?: StageState): { state: StageState; note: string } {
  const analysisId = ws.drift.analysis?.id
  const runs = (ws.history.data?.runs ?? []).filter((r) => r.analysis_id === analysisId)
  if (override) return { state: override, note: override === 'running' ? 'Counterfactual replay in progress on the backend' : override === 'failed' ? 'Last replay request failed' : 'Ready' }
  if (!ws.vessels.data || ws.vessels.data.candidate_count === 0) return { state: 'locked', note: 'Needs scored candidate vessels from M4' }
  if (runs.length) return { state: 'completed', note: `${runs.length} stored run(s) for this drift analysis` }
  return { state: 'ready', note: 'Candidates scored; no PASHA run yet' }
}

const TABS = [
  ['vessels', 'Vessels'], ['pasha', 'PASHA Lab'], ['pasha/hypotheses', 'Hypotheses'], ['pasha/replay', 'Replay'], ['evidence', 'Evidence'], ['report', 'Report'],
] as const

/** Common header, stage strip and tab bar for every Phase 4 route. Preserves ?run= across tabs. */
export function P4Shell({ ws, title, lead, children, m5, runId }: { ws: Workspace; title: string; lead: string; children: ReactNode; m5?: StageState; runId?: string | null }) {
  const { id, ctx, incident } = ws
  useDocumentTitle(incident ? `${title} · ${incident.name}` : title)
  if (ctx.incident.status === 'loading') return <SkeletonRows rows={6} height={70} />
  if (ctx.incident.status === 'error') {
    const missing = ctx.incident.error.status === 404
    return (
      <div className="card"><div className="card__body">
        {missing ? <EmptyState title="Investigation not found" action={<Link to="/app" className="btn btn--sm">Back to Mission Control</Link>}>No incident record exists with id <span className="mono">{id}</span>.</EmptyState>
          : <ErrorState error={ctx.incident.error} onRetry={ctx.incident.retry} />}
      </div></div>
    )
  }
  const q = runId ? `?run=${encodeURIComponent(runId)}` : ''
  const m = m5State(ws, m5)
  const overall = ws.stages.some((s) => s.state === 'failed') ? 'failed' : ws.stages.some((s) => s.state === 'running') ? 'running' : null
  return (
    <div className="p4">
      <header className="mc-head">
        <div>
          <span className="eyebrow">{TAGLINE}</span>
          <h1 style={{ marginTop: 10 }}>{title}</h1>
          <p>{lead}</p>
        </div>
        <Link to={`/investigations/${id}`} className="btn"><ArrowLeft size={15} aria-hidden="true" /> Investigation workspace</Link>
      </header>

      <section className="card inv-head" aria-label="Investigation summary">
        <div className="card__body">
          <div className="inv-head__title"><h2>{incident?.name}</h2>{incident && <StatusPill status={incident.status} />}{overall && <StatusPill status={overall} />}</div>
          <Kv rows={[['Investigation ID', id], ['Scene acquired', utc(ctx.observationTime)], ['Detections', ctx.detections.length ? `${ctx.detections.length} persisted` : 'None persisted']]} />
        </div>
      </section>

      <ol className="stagestrip" aria-label="Investigation stages">
        {ws.stages.map((s) => (
          <li key={s.key}><Link to={`/investigations/${id}/${s.key}`} className={`stagestrip__i stagestrip__i--${s.state}`}><b>{s.code}</b><StageBadge state={s.state} /></Link></li>
        ))}
        <li><span className={`stagestrip__i stagestrip__i--${m.state}`} title={m.note}><b>M5</b><StageBadge state={m.state} /></span></li>
      </ol>

      <nav className="p4tabs" aria-label="Vessel intelligence and PASHA">
        {TABS.map(([path, label]) => (
          <NavLink key={path} end to={`/investigations/${id}/${path}${path.startsWith('pasha') || path === 'evidence' || path === 'report' ? q : ''}`} className={({ isActive }) => `p4tab${isActive ? ' is-active' : ''}`}>{label}</NavLink>
        ))}
      </nav>
      <div className="p4body">{children}</div>
    </div>
  )
}

/** Shown when a page needs M3/M4 output that does not exist yet. */
export function NeedInput({ id, what, to = 'm4' }: { id: string; what: string; to?: string }) {
  return <div className="card"><div className="card__body"><EmptyState title="Not available yet" action={<Link className="btn btn--sm" to={`/investigations/${id}/${to}`}>Go to {to.toUpperCase()}</Link>}>{what}</EmptyState></div></div>
}
