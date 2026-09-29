import { useMemo } from 'react'
import { EmptyState } from '../StateViews'
import { timeAgo } from '../../lib/format'
import type { Incident, Observation, ReportSummary, Scene } from '../../types/api'

interface Ev { key: string; at: string; title: string; sub: string; color: string }

export function ActivityFeed({ incidents, scenes, reports, observations }: { incidents: Incident[]; scenes: Scene[]; reports: ReportSummary[]; observations: Observation[] }) {
  const events = useMemo<Ev[]>(() => {
    const e: Ev[] = [
      ...incidents.map((i) => ({ key: `i${i.id}`, at: i.created_at, title: 'Investigation created', sub: i.name, color: 'var(--primary)' })),
      ...scenes.map((s) => ({ key: `s${s.id}`, at: s.acquisition_time, title: 'Scene acquired', sub: s.product_id, color: 'var(--blue)' })),
      ...observations.map((o) => ({ key: `o${o.id}`, at: o.created_at, title: 'SAR observation ingested', sub: o.original_filename ?? o.product_id ?? o.id, color: 'var(--warn)' })),
      ...reports.map((r) => ({ key: `r${r.id}`, at: r.generated_at, title: 'Report generated', sub: r.decision_status ?? r.id, color: 'var(--ok)' })),
    ]
    return e.filter((x) => !Number.isNaN(new Date(x.at).getTime())).sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, 8)
  }, [incidents, scenes, reports, observations])

  if (events.length === 0) return <EmptyState title="No recent activity">Activity appears here as investigations, scenes and reports are created.</EmptyState>
  return (
    <ul className="activity">
      {events.map((e) => (
        <li key={e.key}>
          <span className="dot" style={{ background: e.color }} aria-hidden="true" />
          <div style={{ minWidth: 0 }}>{e.title}<small style={{ wordBreak: 'break-all' }}>{e.sub}</small></div>
          <time dateTime={e.at}>{timeAgo(e.at)}</time>
        </li>
      ))}
    </ul>
  )
}
