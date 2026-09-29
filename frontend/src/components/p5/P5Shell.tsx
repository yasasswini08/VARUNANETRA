import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { ArrowLeft, History as HistoryIcon, Home } from 'lucide-react'
import { CanonStatus } from '../CanonStatus'
import { EmptyState, ErrorState, SkeletonRows } from '../StateViews'
import { Pill, StatusPill } from '../StatusPill'
import { Kv, utc } from '../investigation/parts'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import type { Workspace } from '../../hooks/useWorkspace'
import type { Canon } from '../../lib/status'
import { TAGLINE } from '../../config/site'

const TABS = [['', 'Overview'], ['vessels', 'Vessels'], ['pasha', 'PASHA'], ['evidence', 'Evidence'], ['report', 'Report']] as const

interface Props {
  ws: Workspace
  title: string
  lead: string
  runId: string | null
  evidenceCount?: { have: number; total: number }
  report?: Canon
  children: ReactNode
  /** Rendered instead of the page body's own document-title logic; keeps print output clean. */
  actions?: ReactNode
}

/** Header, status strip and tab bar shared by the Evidence and Report routes. */
export function P5Shell({ ws, title, lead, runId, evidenceCount, report, children, actions }: Props) {
  const { id, ctx, incident } = ws
  useDocumentTitle(incident ? `${title} · ${incident.name}` : title)
  if (ctx.incident.status === 'loading') return <SkeletonRows rows={6} height={70} />
  if (ctx.incident.status === 'error') {
    const missing = ctx.incident.error.status === 404
    return (
      <div className="card"><div className="card__body">
        {missing
          ? <EmptyState title="Investigation not found" action={<Link to="/history" className="btn btn--sm">Back to History</Link>}>No incident record exists with id <span className="mono">{id}</span>.</EmptyState>
          : <ErrorState error={ctx.incident.error} onRetry={ctx.incident.retry} />}
        {!missing && <p style={{ textAlign: 'center' }}><Link to="/app" className="btn btn--sm">Mission Control</Link></p>}
      </div></div>
    )
  }
  const q = runId ? `?run=${encodeURIComponent(runId)}` : ''
  return (
    <div className="p5">
      <header className="mc-head p5-noprint">
        <div>
          <span className="eyebrow">{TAGLINE}</span>
          <h1 style={{ marginTop: 10 }}>{title}</h1>
          <p>{lead}</p>
        </div>
        <div className="p5-nav">
          <Link to={`/investigations/${id}`} className="btn"><ArrowLeft size={15} aria-hidden="true" /> Back to Investigation</Link>
          <Link to="/app" className="btn btn--sm"><Home size={14} aria-hidden="true" /> Mission Control</Link>
          <Link to="/history" className="btn btn--sm"><HistoryIcon size={14} aria-hidden="true" /> History</Link>
        </div>
      </header>

      <section className="card inv-head p5-noprint" aria-label="Investigation summary">
        <div className="card__body">
          <div className="inv-head__title">
            <h2>{incident?.name}</h2>
            {incident && <StatusPill status={incident.status} />}
            <CanonStatus s="live" />
          </div>
          <Kv rows={[['Investigation ID', id], ['Incident', incident?.name], ['Scene acquired', utc(ctx.observationTime)]]} />
          <div className="p5-status" role="group" aria-label="Evidence and report status">
            {evidenceCount && <span>Evidence <Pill tone={evidenceCount.have ? 'active' : 'muted'} flat>{evidenceCount.have} of {evidenceCount.total} categories</Pill></span>}
            {report && <span>Report <CanonStatus s={report} /></span>}
          </div>
        </div>
      </section>

      <nav className="p4tabs p5-noprint" aria-label="Investigation sections">
        {TABS.map(([path, label]) => (
          <NavLink key={label} end to={`/investigations/${id}${path ? `/${path}` : ''}${path && path !== 'vessels' ? q : ''}`} className={({ isActive }) => `p4tab${isActive ? ' is-active' : ''}`}>{label}</NavLink>
        ))}
      </nav>
      {actions}
      <div className="p4body">{children}</div>
    </div>
  )
}
