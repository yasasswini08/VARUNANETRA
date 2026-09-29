import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowRight, Info } from 'lucide-react'
import { InvestigationMap } from '../../components/investigation/InvestigationMap'
import { Busy, OpError, RunButton, num } from '../../components/investigation/parts'
import { EmptyState, SkeletonRows } from '../../components/StateViews'
import { BackendStatus, Na, SourceTag } from '../../components/p4/parts'
import { NeedInput, P4Shell } from '../../components/p4/P4Shell'
import { useWorkspace } from '../../hooks/useWorkspace'
import { buildLayers, haversineKm, txt, vesselKey, vesselLabel } from '../../lib/p4'


type SortKey = 'backend' | 'overall_score' | 'spatial_score' | 'temporal_score' | 'trajectory_score' | 'behavioural_score'
const SORTS: [SortKey, string][] = [['backend', 'Backend order'], ['overall_score', 'Correlation score'], ['spatial_score', 'Spatial fit'], ['temporal_score', 'Temporal fit'], ['trajectory_score', 'Drift compatibility'], ['behavioural_score', 'AIS behaviour']]

export default function VesselsPage() {
  const { id = '' } = useParams()
  const ws = useWorkspace(id)
  const { vessels, drift } = ws
  const [sort, setSort] = useState<SortKey>('backend')
  const [sel, setSel] = useState<string | null>(null)
  const [dist, setDist] = useState('120')
  const d = Number(dist), valid = Number.isFinite(d) && d > 0
  const running = vessels.op.status === 'running'
  const err = vessels.op.status === 'error' ? vessels.op.error : null
  const noAis = err?.status === 404

  const base = vessels.data?.candidates ?? []
  const list = useMemo(() => {
    const idx = base.map((v, i) => ({ v, i }))
    if (sort === 'backend') return idx
    return [...idx].sort((a, b) => (b.v[sort] ?? -1) - (a.v[sort] ?? -1))
  }, [base, sort])
  const layers = useMemo(() => buildLayers({ ctx: ws.ctx, analysis: drift.analysis, candidates: base, selectedId: sel }), [ws.ctx, drift.analysis, base, sel])
  const origin = drift.analysis?.probable_origin_centroid ?? null

  return (
    <P4Shell ws={ws} title="Vessel Intelligence" lead="Candidate vessels correlated against the reconstructed drift. Scores are the backend's M4 result; the browser adds no ranking.">
      {!drift.analysis && drift.stored.status === 'loading' && ws.ctx.refs.analysisId ? <SkeletonRows rows={4} /> : !drift.analysis ? (
        <NeedInput id={id} to="m3" what="Vessel correlation needs a completed M3 drift analysis. Run drift reconstruction first." />
      ) : (
        <div className="p4-split">
          <section className="card" aria-label="Correlation map">
            <div className="card__head"><h2 className="card__title">Correlation geometry</h2></div>
            <div className="card__body">
              <InvestigationMap layers={layers} />
              <p className="hint" style={{ marginTop: 8 }}>Vessel markers are each candidate&apos;s backend best-fit position. No AIS track geometry is returned by the API, so none is drawn.</p>
            </div>
          </section>

          <section className="card" aria-label="Candidate vessels">
            <div className="card__head">
              <h2 className="card__title">Candidate vessels{vessels.data ? ` · ${vessels.data.candidate_count}` : ''}</h2>
              {list.length > 1 && <label className="inline-field p4-sort">Sort<select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>{SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>}
            </div>
            <div className="card__body p4-stack">
              <div className="p4-run">
                <label className="inline-field">Max distance from probable origin (km)<input type="number" min={1} value={dist} onChange={(e) => setDist(e.target.value)} /></label>
                <RunButton busy={running} disabled={!valid || ws.stages[3].state === 'locked'} onClick={() => void vessels.run(d)}>{vessels.data ? 'Re-run correlation' : 'Correlate vessels'}</RunButton>
              </div>
              {running && <Busy>PROCESSING — AIS retrieval and scoring run on the backend. No progress is reported.</Busy>}
              {err && (noAis
                ? <div className="callout callout--warn" role="alert"><Info size={15} aria-hidden="true" /><span>{err.message}. No vessels are shown because none were returned.</span></div>
                : <OpError error={err} onRetry={() => void vessels.run(d)} title="Vessel correlation failed" />)}
              {!vessels.data && !err && !running && <EmptyState title="No candidate vessels yet">Run correlation to retrieve and score AIS candidates for this drift analysis.</EmptyState>}
              {vessels.data && list.length === 0 && <EmptyState title="No candidate vessels returned">The backend scored zero vessels for this analysis.</EmptyState>}

              <ul className="vlist">
                {list.map(({ v, i }, rank) => {
                  const key = vesselKey(v, i)
                  const km = origin && v.best_fit_position ? haversineKm(origin, v.best_fit_position) : null
                  return (
                    <li key={key} className={`vcard${sel === key ? ' is-sel' : ''}`} onMouseEnter={() => setSel(key)} onFocus={() => setSel(key)}>
                      <div className="vcard__top">
                        <strong>{vesselLabel(v)}</strong>
                        <span className="vcard__score mono" title="Backend correlation score">{num(v.overall_score, 3)}</span>
                      </div>
                      <div className="vcard__meta">
                        <span>MMSI <b className="mono">{txt(v.mmsi) ?? <Na />}</b></span>
                        <span>Type <b>{txt(v.vessel_type) ?? <Na />}</b></span>
                        <span>Best-fit hour <b className="mono">{v.best_fit_hour !== null && v.best_fit_hour !== undefined ? `${v.best_fit_hour.toFixed(1)} h` : <Na />}</b></span>
                        <span>From origin <b className="mono">{km !== null ? `${km.toFixed(1)} km` : <Na />}</b> {km !== null && <SourceTag kind="derived" />}</span>
                      </div>
                      <div className="vcard__meta">
                        <span>Spatial <b className="mono">{num(v.spatial_score, 3)}</b></span><span>Temporal <b className="mono">{num(v.temporal_score, 3)}</b></span>
                        <span>Drift <b className="mono">{num(v.trajectory_score, 3)}</b></span><span>AIS <b className="mono">{num(v.behavioural_score, 3)}</b></span>
                      </div>
                      <div className="vcard__foot">
                        <span>{sort === 'backend' ? `Backend rank ${rank + 1}` : 'Re-sorted view'} · <BackendStatus status={v.status} /></span>
                        <Link className="link-more" to={`/investigations/${id}/vessels/${encodeURIComponent(key)}`}>Inspect <ArrowRight size={13} aria-hidden="true" /></Link>
                      </div>
                    </li>
                  )
                })}
              </ul>
              <div className="note"><Info aria-hidden="true" /><span>Correlation is not attribution. A high score means a vessel&apos;s AIS position is compatible with the drift; it does not establish a source.</span></div>
              {vessels.data && vessels.data.candidate_count > 0 && <Link to={`/investigations/${id}/pasha`} className="btn btn--primary">Open PASHA Simulation Lab <ArrowRight size={15} aria-hidden="true" /></Link>}
            </div>
          </section>
        </div>
      )}
    </P4Shell>
  )
}
