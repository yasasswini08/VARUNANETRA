import { Link, useParams } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Busy, num, utc } from '../../components/investigation/parts'
import { BackendStatus, Gate, KvU, Na, SourceTag, Expand } from '../../components/p4/parts'
import { P4Shell } from '../../components/p4/P4Shell'
import { RunGate } from '../../components/p4/RunGate'
import { useWorkspace } from '../../hooks/useWorkspace'
import { usePasha } from '../../hooks/usePasha'
import { txt, vesselKey, vesselLabel } from '../../lib/p4'
import { fmtLat, fmtLon } from '../../lib/format'

export default function HypothesesPage() {
  const { id = '' } = useParams()
  const ws = useWorkspace(id)
  const pasha = usePasha(ws)
  return (
    <P4Shell ws={ws} title="Hypothesis Comparison" lead="Each candidate is one counterfactual hypothesis. Results are shown exactly as the backend returned them, in backend order; the browser designates no winner." runId={pasha.runId}>
      {pasha.op.status === 'running' && <Busy>A PASHA run is in progress.</Busy>}
      <RunGate ws={ws} pasha={pasha}>{(r) => (
        <>
          <section className="card"><div className="card__body p4-banner">
            <div><span className="eyebrow">Backend decision</span><div className="p4-outcome" style={{ marginTop: 6 }}><BackendStatus status={r.outcome.status} /><span className="mono">margin {r.outcome.margin !== null ? r.outcome.margin.toFixed(4) : 'not computed'}</span></div><p className="p4-reason">{r.outcome.reason}</p></div>
            <KvU rows={[['Run ID', r.run_id], ['Created', utc(pasha.historyRow?.created_at), 'Not in run history'], ['Hypotheses', String(r.candidates.length)]]} />
          </div></section>
          <div className="hgrid">
            {r.candidates.map((c, i) => {
              const k = vesselKey(c, i), f = c.falsification, pp = c.physical_plausibility
              return (
                <article key={k} className="card hcard" aria-label={`Hypothesis ${vesselLabel(c)}`}>
                  <div className="card__head"><h2 className="card__title">{vesselLabel(c)}</h2><BackendStatus status={c.status} /></div>
                  <div className="card__body p4-stack">
                    <KvU rows={[
                      ['Hypothesis ID', `${r.run_id.slice(0, 8)}·${k}`], ['Candidate', txt(c.mmsi) ? `MMSI ${c.mmsi}` : null, 'No MMSI'],
                      ['Source', c.best_fit_position ? `${fmtLat(c.best_fit_position.lat)} ${fmtLon(c.best_fit_position.lon)}` : null],
                      ['Release', c.best_fit_hour !== null && c.best_fit_hour !== undefined ? `${c.best_fit_hour.toFixed(1)} h before observation` : null],
                      ['M4 correlation score', c.overall_score !== undefined ? num(c.overall_score, 4) : null, 'Not returned'],
                      ['Physical consistency score', f?.physical_consistency_score !== undefined ? num(f.physical_consistency_score, 4) : null, 'Not computed'],
                    ]} />
                    <div><h3 className="p4-h">Falsification gate</h3>
                      <ul className="gates"><Gate label="Spatial" pass={f?.spatial_test} /><Gate label="Temporal" pass={f?.temporal_test} /><Gate label="Drift" pass={f?.drift_test} /><Gate label="Physical" pass={f?.physical_test} /></ul>
                      <p className="hint">Gate result: <b>{f ? (f.pass_fail ? 'passed' : 'failed') : <Na why="Not computed" />}</b>{f && f.reasons.length > 0 && <> · <span className="mono">{f.reasons.join(', ')}</span></>}</p>
                    </div>
                    <div><h3 className="p4-h">Physical plausibility</h3>
                      {pp ? <p className="hint"><b>{pp.plausible ? 'Plausible' : 'Not plausible'}</b> — {pp.reason ?? 'no reason returned'}</p> : <p className="hint"><Na why="Not computed" /></p>}</div>
                    <Expand title={<>Provenance <SourceTag kind="live" /></>}>
                      <KvU rows={[['Run ID', r.run_id], ['Analysis ID', r.analysis_id], ['Candidate record', c.db_id ?? null, 'Not persisted'], ['Behavioural signal (supporting only)', f?.behavioural_signal !== undefined ? String(f.behavioural_signal) : null]]} />
                    </Expand>
                    <Link className="link-more" to={`/investigations/${id}/pasha/replay?run=${r.run_id}&c=${encodeURIComponent(k)}`}>Replay detail <ArrowRight size={13} aria-hidden="true" /></Link>
                  </div>
                </article>
              )
            })}
          </div>
          <p className="hint" style={{ marginTop: 12 }}>Scores are physical consistency scores, not probabilities of responsibility. The order shown is the order the backend returned.</p>
          <p><Link className="btn btn--sm" to={`/investigations/${id}`}>Back to investigation workspace</Link></p>
        </>
      )}</RunGate>
    </P4Shell>
  )
}
