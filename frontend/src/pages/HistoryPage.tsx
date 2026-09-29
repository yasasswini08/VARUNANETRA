import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Info, Search } from 'lucide-react'
import { CanonStatus } from '../components/CanonStatus'
import { EmptyState, ErrorState, SkeletonRows } from '../components/StateViews'
import { StatusPill } from '../components/StatusPill'
import { incidentCenter } from '../components/mission/RecentInvestigations'
import { STAGE_TEXT, useHistoryRows, type RecordStage } from '../hooks/useHistory'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { formatDateTime } from '../lib/format'

type Sort = 'newest' | 'oldest' | 'name'

export default function HistoryPage() {
  useDocumentTitle('Investigation History')
  const { incidents, rows, runs, reports, scenes, observations } = useHistoryRows()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const [stage, setStage] = useState<'all' | RecordStage>('all')
  const [rep, setRep] = useState<'all' | 'yes' | 'no'>('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [sort, setSort] = useState<Sort>('newest')

  const statuses = useMemo(() => Array.from(new Set(rows.map((r) => r.inc.status))), [rows])
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase()
    const t0 = from ? new Date(`${from}T00:00:00Z`).getTime() : -Infinity
    const t1 = to ? new Date(`${to}T23:59:59Z`).getTime() : Infinity
    const f = rows.filter((r) => {
      const t = new Date(r.inc.created_at).getTime()
      return (status === 'all' || r.inc.status === status) && (stage === 'all' || r.stage === stage)
        && (rep === 'all' || (rep === 'yes') === (r.reports.length > 0)) && t >= t0 && t <= t1
        && (!n || r.inc.name.toLowerCase().includes(n) || r.inc.id.toLowerCase().includes(n))
    })
    return [...f].sort((a, b) => sort === 'name' ? a.inc.name.localeCompare(b.inc.name) : (+new Date(a.inc.created_at) - +new Date(b.inc.created_at)) * (sort === 'newest' ? -1 : 1))
  }, [rows, q, status, stage, rep, from, to, sort])

  const filtered = q || status !== 'all' || stage !== 'all' || rep !== 'all' || from || to
  const partial = [runs, reports, scenes, observations].some((s) => s.status === 'error')

  return (
    <div className="inner">
      <header className="page-head">
        <span className="eyebrow">History</span>
        <h1>Investigation history</h1>
        <p>Stored investigation records from the backend. Nothing on this page is sample data.</p>
      </header>

      <div className="note" style={{ marginBottom: 16 }}>
        <Info aria-hidden="true" />
        <span>The backend keeps no separate investigation table: each investigation is an incident record, and its ID is the investigation ID. The stage shown is the furthest step for which a stored artefact exists. Open a record for the per-stage detail.</span>
      </div>

      <div className="toolbar p5-tools">
        <div className="search">
          <Search aria-hidden="true" />
          <input className="field" type="search" aria-label="Search investigations" placeholder="Search by incident name or ID…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="field" aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>{statuses.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="field" aria-label="Filter by current stage" value={stage} onChange={(e) => setStage(e.target.value as 'all' | RecordStage)}>
          <option value="all">All stages</option>{(Object.keys(STAGE_TEXT) as RecordStage[]).map((s) => <option key={s} value={s}>{STAGE_TEXT[s]}</option>)}
        </select>
        <select className="field" aria-label="Filter by report" value={rep} onChange={(e) => setRep(e.target.value as 'all' | 'yes' | 'no')}>
          <option value="all">Any report state</option><option value="yes">Has report</option><option value="no">No report</option>
        </select>
        <label className="p5-date"><span>From</span><input className="field" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="p5-date"><span>To</span><input className="field" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></label>
        <select className="field" aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="name">Name A–Z</option>
        </select>
      </div>

      <section className="card" aria-label="Investigation records">
        {incidents.status === 'loading' && <div className="card__body"><SkeletonRows rows={6} /></div>}
        {incidents.status === 'error' && <ErrorState error={incidents.error} onRetry={incidents.retry} />}
        {incidents.status === 'success' && rows.length === 0 && (
          <EmptyState title="No investigations yet" action={<Link className="btn btn--sm" to="/investigations/new">Start an investigation</Link>}>The backend has no incident records. Investigations appear here as soon as one is created.</EmptyState>
        )}
        {incidents.status === 'success' && rows.length > 0 && shown.length === 0 && (
          <EmptyState title="No matches" action={filtered ? <button className="btn btn--sm" onClick={() => { setQ(''); setStatus('all'); setStage('all'); setRep('all'); setFrom(''); setTo('') }}>Clear filters</button> : undefined}>No investigations match the current filters.</EmptyState>
        )}
        {shown.length > 0 && (
          <div className="table-wrap" role="region" aria-label="Investigation table" tabIndex={0}>
            <table className="tbl">
              <caption className="sr-only">Investigation records</caption>
              <thead><tr><th scope="col">Investigation / incident ID</th><th scope="col">Incident</th><th scope="col">Area centre</th><th scope="col">Created</th><th scope="col">Status</th><th scope="col">Current stage</th><th scope="col">Report</th><th scope="col"><span className="sr-only">Open</span></th></tr></thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.inc.id}>
                    <td><Link className="id-link" to={`/history/${r.inc.id}`} title={r.inc.id}>{r.inc.id.slice(0, 8)}</Link></td>
                    <td>{r.inc.name}</td>
                    <td className="mono">{incidentCenter(r.inc)}</td>
                    <td className="mono">{formatDateTime(r.inc.created_at)}</td>
                    <td><StatusPill status={r.inc.status} /></td>
                    <td>{STAGE_TEXT[r.stage]}</td>
                    <td><CanonStatus s={r.report} label={r.report === 'ready' ? 'READY' : undefined} /></td>
                    <td><Link className="btn btn--sm" to={`/history/${r.inc.id}`} aria-label={`Open investigation ${r.inc.name}`}>Open <ArrowRight size={13} aria-hidden="true" /></Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {incidents.status === 'success' && rows.length > 0 && (
          <div className="p5-foot mono">
            Showing {shown.length} of {rows.length}{rows.length >= 100 ? '+' : ''} investigations
            {partial && <span> · stage/report columns may be incomplete: a supporting list failed to load</span>}
          </div>
        )}
      </section>
    </div>
  )
}
