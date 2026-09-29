import { Link, useParams, useSearchParams } from 'react-router-dom'
import { utc, num } from '../../components/investigation/parts'
import { InvestigationMap } from '../../components/investigation/InvestigationMap'
import { BackendStatus, Expand, Gate, KvU, Meter, Na, ProvPanel, SourceTag } from '../../components/p4/parts'
import { P4Shell } from '../../components/p4/P4Shell'
import { RunGate } from '../../components/p4/RunGate'
import { useWorkspace } from '../../hooks/useWorkspace'
import { usePasha } from '../../hooks/usePasha'
import { buildLayers, releaseTime, vesselKey, vesselLabel } from '../../lib/p4'
import { fmtLat, fmtLon, outerRings, ringCenter } from '../../lib/format'
import type { PashaRunResult } from '../../types/api'

const NOT_RETURNED = 'Not returned by the PASHA API'

function Step({ n, label, children }: { n: number; label: string; children: React.ReactNode }) {
  return <li className="p4flow__step"><div className="p4flow__head"><span className="p4-n">{n}</span><h2>{label}</h2></div><div className="p4flow__body">{children}</div></li>
}

export default function ReplayPage() {
  const { id = '' } = useParams()
  const [q, setQ] = useSearchParams()
  const ws = useWorkspace(id)
  const pasha = usePasha(ws)

  const body = (r: PashaRunResult) => {
    const list = r.candidates
    const wanted = q.get('c')
    const i = Math.max(0, list.findIndex((c, n) => vesselKey(c, n) === wanted))
    const c = list[i]
    if (!c) return <p className="hint">This run holds no candidates.</p>
    const a = ws.drift.analysis, f = c.falsification, pp = c.physical_plausibility
    const slickRing = ws.ctx.slick ? outerRings(ws.ctx.slick.detection.geometry)[0] : undefined
    const slickC = slickRing ? ringCenter(slickRing) : null
    const rel = releaseTime(ws.ctx.observationTime, c.best_fit_hour)
    const layers = buildLayers({ ctx: ws.ctx, analysis: a, candidates: [c], selectedId: vesselKey(c, i), showCounterfactual: true })
    const env = [ws.env.windData && { t: 'Wind', d: ws.env.windData }, ws.env.currentsData && { t: 'Currents', d: ws.env.currentsData }].filter((x): x is { t: string; d: NonNullable<typeof ws.env.windData> } => !!x)
    return (
      <>
        <section className="card"><div className="card__body p4-banner">
          <label className="inline-field">Hypothesis<select value={vesselKey(c, i)} onChange={(e) => setQ((p) => { const n = new URLSearchParams(p); n.set('c', e.target.value); return n }, { replace: true })}>{list.map((x, n) => <option key={vesselKey(x, n)} value={vesselKey(x, n)}>{vesselLabel(x)}</option>)}</select></label>
          <div className="p4-outcome"><span>Run outcome</span><BackendStatus status={r.outcome.status} /><span>· this candidate</span><BackendStatus status={c.status} /></div>
        </div></section>

        <ol className="p4flow">
          <Step n={1} label="Input">
            <KvU rows={[['Run ID', r.run_id], ['Run created', utc(pasha.historyRow?.created_at), 'Not in run history'], ['Drift analysis', r.analysis_id], ['Observed slick', ws.ctx.slick ? `score ${ws.ctx.slick.detection.detection_score.toFixed(3)} · ${ws.ctx.slick.detection.area_km2.toFixed(1)} km²` : null, 'Detection not loaded'], ['Scene acquired', utc(ws.ctx.observationTime)], ['Drift model', a?.model_version ?? null]]} />
            <ProvPanel title="Input provenance" items={[{ title: 'M3 · wind', p: a?.provenance.wind }, { title: 'M3 · currents', p: a?.provenance.current }]} />
          </Step>
          <Step n={2} label="Counterfactual">
            <p className="hint">If <b>{vesselLabel(c)}</b> released oil at its best-fit position and time, would the drift reproduce the observed slick?</p>
            <KvU rows={[['Source position', c.best_fit_position ? `${fmtLat(c.best_fit_position.lat)} ${fmtLon(c.best_fit_position.lon)}` : null], ['Release time', rel ? utc(rel.toISOString()) : null, 'needs scene time and best-fit hour'], ['Hours before observation', c.best_fit_hour !== null && c.best_fit_hour !== undefined ? c.best_fit_hour.toFixed(2) : null]]} />
            {rel && <p className="hint">Release time is <SourceTag kind="derived" /> scene time minus best-fit hour.</p>}
          </Step>
          <Step n={3} label="Simulation">
            <div className="callout callout--muted"><span>Simulated trajectory: <Na why="Backend did not provide trajectory geometry" />. The forward replay ran server-side; only its scores are returned.</span></div>
            <InvestigationMap layers={layers} />
          </Step>
          <Step n={4} label="Comparison">
            <div className="table-wrap"><table className="tbl cmp">
              <caption className="sr-only">Observed versus counterfactual</caption>
              <thead><tr><th>Aspect</th><th>Observed</th><th>Counterfactual</th></tr></thead>
              <tbody>
                <tr><th scope="row">Source</th><td>{ws.drift.analysis?.probable_origin_centroid ? <>{`${fmtLat(ws.drift.analysis.probable_origin_centroid.lat)} ${fmtLon(ws.drift.analysis.probable_origin_centroid.lon)}`} <small>reconstructed · ± {ws.drift.analysis.uncertainty_km} km</small></> : <Na />}</td><td>{c.best_fit_position ? `${fmtLat(c.best_fit_position.lat)} ${fmtLon(c.best_fit_position.lon)}` : <Na />}</td></tr>
                <tr><th scope="row">Trajectory</th><td><Na why="Not provided" /></td><td><Na why="Backend did not provide trajectory geometry" /></td></tr>
                <tr><th scope="row">Endpoint</th><td>{slickC ? <>{`${fmtLat(slickC[1])} ${fmtLon(slickC[0])}`} <SourceTag kind="derived" /> <small>slick vertex mean</small></> : <Na />}</td><td><Na why={NOT_RETURNED} /></td></tr>
                <tr><th scope="row">Timing</th><td>{utc(ws.ctx.observationTime) ?? <Na />}</td><td>{f ? <>Temporal test <b>{f.temporal_test ? 'passed' : 'failed'}</b> <small>arrival error value not returned</small></> : <Na why="Not computed" />}</td></tr>
                <tr><th scope="row">Spatial error</th><td><Na why="Not applicable" /></td><td>{f ? <>Spatial test <b>{f.spatial_test ? 'passed' : 'failed'}</b>, drift test <b>{f.drift_test ? 'passed' : 'failed'}</b> <small>overlap and centroid distance are stored by the backend but not returned</small></> : <Na why="Not computed" />}</td></tr>
                <tr><th scope="row">Environmental context</th><td>{env.length ? env.map((e) => `${e.t}: ${e.d.variables.join(', ')}`).join(' · ') : <Na why="M2 not run in this browser" />}</td><td><Na why={NOT_RETURNED} /></td></tr>
                <tr><th scope="row">Plausibility</th><td><Na why="Not applicable" /></td><td>{pp ? <>{pp.plausible ? 'Plausible' : 'Not plausible'} <small>{pp.reason}</small></> : <Na why="Not computed" />}</td></tr>
                <tr><th scope="row">Decision</th><td><Na why="Not applicable" /></td><td><BackendStatus status={c.status} /></td></tr>
              </tbody>
            </table></div>
          </Step>
          <Step n={5} label="Evidence">
            <Meter label="Physical consistency score" value={f?.physical_consistency_score} hint="Physical consistency of the replay with the observation. Not a probability of responsibility." />
            <Meter label="M4 correlation score" value={c.overall_score} />
            <Meter label="Behavioural signal (supporting only)" value={f?.behavioural_signal} />
            {pp && <KvU rows={[['Estimated spill mass', pp.estimated_spill_tonnes_low !== undefined && pp.estimated_spill_tonnes_high !== undefined ? `${pp.estimated_spill_tonnes_low}–${pp.estimated_spill_tonnes_high} t` : null], ['Vessel capacity used', pp.vessel_capacity_tonnes !== undefined ? `${num(pp.vessel_capacity_tonnes, 0)} t` : null]]} />}
            <p className="hint">Generated evidence references: <Na why="Not returned by the PASHA API" />. Reports belong to a later phase.</p>
            <Expand title={<>Provenance <SourceTag kind="live" /></>}><KvU rows={[['Run ID', r.run_id], ['Analysis ID', r.analysis_id], ['Candidate record', c.db_id ?? null, 'Not persisted']]} /></Expand>
          </Step>
          <Step n={6} label="Decision gate">
            <ul className="gates"><Gate label="Spatial" pass={f?.spatial_test} /><Gate label="Temporal" pass={f?.temporal_test} /><Gate label="Drift" pass={f?.drift_test} /><Gate label="Physical" pass={f?.physical_test} /></ul>
            <KvU rows={[['Gate result', f ? (f.pass_fail ? 'Passed' : 'Failed') : null, 'Not computed'], ['Failure reasons', f ? (f.reasons.length ? f.reasons.join(', ') : 'None') : null, 'Not computed'], ['Run decision', r.outcome.status], ['Run decision reason', r.outcome.reason], ['Margin', r.outcome.margin !== null ? r.outcome.margin.toFixed(4) : null, 'Not computed']]} />
            <p><Link className="btn btn--sm" to={`/investigations/${id}`}>Back to investigation workspace</Link></p>
          </Step>
        </ol>
      </>
    )
  }
  return (
    <P4Shell ws={ws} title="Replay Results" lead="Input → counterfactual → simulation → comparison → evidence → decision gate, for one hypothesis." runId={pasha.runId}>
      <RunGate ws={ws} pasha={pasha}>{body}</RunGate>
    </P4Shell>
  )
}
