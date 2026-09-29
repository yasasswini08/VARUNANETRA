import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, FileText, Info, Search as SearchIcon } from 'lucide-react'
import { CanonStatus } from '../../components/CanonStatus'
import { EmptyState, ErrorState, SkeletonRows } from '../../components/StateViews'
import { StatusPill } from '../../components/StatusPill'
import { Kv, utc } from '../../components/investigation/parts'
import { ReportList } from '../../components/p5/ReportActions'
import { useHistoryRecord } from '../../hooks/useHistory'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { fmtLat, fmtLon, outerRings, ringCenter } from '../../lib/format'

export default function HistoryDetailPage() {
  const { id = '' } = useParams()
  const r = useHistoryRecord(id)
  const inc = r.detail.data?.incident
  useDocumentTitle(inc ? `${inc.name} · History` : 'Past investigation')

  const back = <Link to="/history" className="btn"><ArrowLeft size={15} aria-hidden="true" /> Back to History</Link>
  if (r.detail.status === 'loading') return <SkeletonRows rows={6} height={70} />
  if (r.detail.status === 'error') {
    const missing = r.detail.error.status === 404
    return (
      <div className="card"><div className="card__body">
        {missing ? <EmptyState title="Investigation not found" action={back}>No incident record exists with id <span className="mono">{id}</span>.</EmptyState>
          : <><ErrorState error={r.detail.error} onRetry={r.detail.retry} /><p style={{ textAlign: 'center' }}>{back}</p></>}
      </div></div>
    )
  }
  const ring = inc ? outerRings(inc.bbox)[0] : undefined
  const c = ring ? ringCenter(ring) : null
  const done = r.stages.filter((s) => s.state === 'complete').length
  const listErr = [r.obs, r.scenes, r.reports, r.runs].find((s) => s.status === 'error')
  const evidence = [
    r.obs.data?.observations.length ? 'SAR observation' : null, r.dets.length ? 'Detection' : null,
    r.stages[1].state === 'complete' ? 'Environment' : null, r.analysis.data ? 'Drift reconstruction' : null,
    r.stages[3].state === 'complete' ? 'Vessel correlation' : null, r.pr.length ? 'PASHA replay' : null, r.rp.length ? 'Report artifact' : null,
  ].filter((x): x is string => !!x)

  return (
    <div className="inner p5">
      <header className="mc-head">
        <div>
          <span className="eyebrow">Past investigation</span>
          <h1 style={{ marginTop: 10 }}>{inc?.name}</h1>
          <p>Read from stored artefacts. Opening this page runs nothing.</p>
        </div>
        <div className="p5-nav">{back}<Link to="/app" className="btn btn--sm">Mission Control</Link></div>
      </header>

      <section className="card inv-head" aria-label="Investigation summary">
        <div className="card__body">
          <div className="inv-head__title"><h2>Investigation summary</h2>{inc && <StatusPill status={inc.status} />}<CanonStatus s="live" /></div>
          <Kv rows={[
            ['Investigation ID', id], ['Incident', inc?.name], ['Area centre', c ? `${fmtLat(c[1])} ${fmtLon(c[0])}` : null],
            ['Created', utc(r.created) ?? 'Not in the first 100 incident records'],
            ['Last recorded activity (derived)', utc(r.updated) ?? 'No report or PASHA timestamp; the backend stores no update time'],
            ['Stages with a stored result', `${done} of ${r.stages.length}`],
          ]} />
          <div className="p5-rowact" style={{ marginTop: 14 }}>
            <Link className="btn btn--primary btn--sm" to={`/investigations/${id}`}>Open workspace <ArrowRight size={13} aria-hidden="true" /></Link>
            <Link className="btn btn--sm" to={`/investigations/${id}/evidence`}><SearchIcon size={13} aria-hidden="true" /> Evidence</Link>
            <Link className="btn btn--sm" to={`/investigations/${id}/report`}><FileText size={13} aria-hidden="true" /> Report</Link>
          </div>
        </div>
      </section>

      {listErr && listErr.status === 'error' && <div className="note" style={{ marginTop: 14 }}><Info aria-hidden="true" /><span>Some stored records could not be loaded ({listErr.error.message}); stages below may be incomplete.</span></div>}

      <div className="p5-hgrid">
        <section className="card" aria-label="Pipeline">
          <div className="card__head"><h2 className="card__title">Pipeline</h2></div>
          <div className="card__body">
            <ol className="hstages">
              {r.stages.map((s) => (
                <li key={s.code}><b className="mono">{s.code}</b><span>{s.title}<small>{s.note}</small></span><CanonStatus s={s.state} /></li>
              ))}
            </ol>
            <p className="hint">Not executed means the backend holds no stored artefact for that stage. It does not mean the stage failed; failures are not persisted. M2 and M4 summaries are not stored server-side and are known only if this browser cached them or a later stage recorded them.</p>
          </div>
        </section>

        <div className="p5-stack">
          <section className="card" aria-label="Evidence available">
            <div className="card__head"><h2 className="card__title">Evidence available</h2></div>
            <div className="card__body">
              {evidence.length ? <ul className="p5-chips">{evidence.map((e) => <li key={e} className="tag">{e}</li>)}</ul> : <p className="hint">No evidence artefacts are stored for this investigation.</p>}
            </div>
          </section>
          <section className="card" aria-label="Reports">
            <div className="card__head"><h2 className="card__title">Report</h2><CanonStatus s={r.rp.length ? 'complete' : 'not-executed'} /></div>
            <div className="card__body">
              {r.reports.status === 'error' ? <ErrorState compact error={r.reports.error} onRetry={r.reports.retry} title="Reports could not be loaded" />
                : r.rp.length ? <ReportList reports={r.rp} /> : <p className="hint">No report has been generated. <Link className="link-more" to={`/investigations/${id}/report`}>Open the report page</Link></p>}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
