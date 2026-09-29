import { useMemo } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowRight, Circle } from 'lucide-react'
import { InvestigationMap } from '../../components/investigation/InvestigationMap'
import { Kv, ProvenanceBlock, num, utc } from '../../components/investigation/parts'
import { CanonStatus } from '../../components/CanonStatus'
import { P5Shell } from '../../components/p5/P5Shell'
import { ReportList } from '../../components/p5/ReportActions'
import { Missing, OriginTag, RawData, Scroller, fmt } from '../../components/p5/parts'
import { BackendStatus, Gate, KvU } from '../../components/p4/parts'
import { ErrorState, SkeletonRows } from '../../components/StateViews'
import { useWorkspace, type Workspace } from '../../hooks/useWorkspace'
import { usePasha, type Pasha } from '../../hooks/usePasha'
import { reportState, useReports, type ReportsCtx } from '../../hooks/useReports'
import { KIND_META, KIND_ORDER, buildEvidence, type EvidenceEntry, type EvidenceKind } from '../../lib/evidence'
import { buildLayers, vesselKey, vesselLabel } from '../../lib/p4'
import { fmtLat, fmtLon } from '../../lib/format'
import type { EnvironmentSummary } from '../../types/api'

type View = 'timeline' | 'provenance' | EvidenceKind
const isKind = (v: string | null): v is EvidenceKind => !!v && (KIND_ORDER as string[]).includes(v)

function Timeline({ entries, select }: { entries: EvidenceEntry[]; select: (v: View) => void }) {
  return (
    <>
      <p className="hint">Evidence timeline. The backend returns no relationships between evidence objects, so this is the pipeline stage order, not a graph. Times are shown only where the backend supplied one.</p>
      <ol className="etl" aria-label="Evidence timeline">
        {entries.map((e, i) => (
          <li key={e.kind} className={`etl__i etl__i--${e.state}`}>
            <span className="etl__n" aria-hidden="true">{i + 1}</span>
            <div className="etl__b">
              <div className="etl__h">
                <b>{KIND_META[e.kind].stage} · {KIND_META[e.kind].title}</b>
                <CanonStatus s={e.state} />
              </div>
              <p>{e.item ? e.item.summary : e.reason}</p>
              <small className="mono">{e.item ? (e.item.timestamp ? utc(e.item.timestamp) : 'No timestamp returned by the backend') : '—'}</small>
              {e.item && <button type="button" className="link-more" onClick={() => select(e.kind)}>Inspect <ArrowRight size={13} aria-hidden="true" /></button>}
            </div>
          </li>
        ))}
      </ol>
    </>
  )
}

function Body({ kind, ws, pasha, reports }: { kind: EvidenceKind; ws: Workspace; pasha: Pasha; reports: ReportsCtx }) {
  const { ctx, detection, env, drift, vessels } = ws
  const id = ws.id
  if (kind === 'observation') {
    const o = ctx.input ?? ctx.observations.data?.observations[0]
    const scenes = ctx.scenes.data?.scenes ?? []
    return (
      <>
        {o && <KvU rows={[['Observation ID', o.id], ['File', o.original_filename], ['Sensor', o.sensor], ['Product ID', o.product_id], ['Product type', o.product_type], ['Polarisation', o.polarization], ['Acquired', utc(o.acquisition_time)], ['Ingestion status', o.status]]} />}
        <h4 className="p5-h4">Persisted scenes ({scenes.length})</h4>
        {scenes.length === 0 ? <p className="hint">No scene rows are persisted for this incident.</p> : (
          <Scroller label="Persisted scenes"><table className="tbl"><thead><tr><th scope="col">Product</th><th scope="col">Acquired</th><th scope="col">Provider</th><th scope="col">Status</th></tr></thead>
            <tbody>{scenes.map((s) => <tr key={s.id}><td className="mono">{s.product_id}</td><td className="mono">{utc(s.acquisition_time)}</td><td>{s.provider}</td><td>{s.processing_status}</td></tr>)}</tbody></table></Scroller>
        )}
      </>
    )
  }
  if (kind === 'detection') {
    const r = detection.result
    return (
      <>
        {r && <KvU rows={[['Detection run', r.detection_id], ['Accepted candidates', String(r.diagnostics.accepted_count ?? r.candidates.length)], ['Raw components', r.diagnostics.raw_component_count !== undefined ? String(r.diagnostics.raw_component_count) : null], ['Dark-pixel fraction', fmt(r.diagnostics.dark_pixel_fraction, 4)]]} />}
        <h4 className="p5-h4">{r ? 'Candidates & slick characterisation' : 'Persisted detections'}</h4>
        <Scroller label="Detection candidates">
          <table className="tbl">
            <thead><tr><th scope="col">Label</th><th scope="col">Area km²</th><th scope="col">Length km</th><th scope="col">Width km</th><th scope="col">Elongation</th><th scope="col">Contrast dB</th><th scope="col">Land dist. km</th><th scope="col">Score</th></tr></thead>
            <tbody>
              {r ? r.candidates.map((c, i) => <tr key={i}><td>{c.classification_label}{c.rejected_reason && <small className="na"> · rejected: {c.rejected_reason}</small>}</td><td className="mono">{num(c.area_km2)}</td><td className="mono">{num(c.length_km)}</td><td className="mono">{num(c.width_km)}</td><td className="mono">{num(c.elongation)}</td><td className="mono">{num(c.contrast_db)}</td><td className="mono">{num(c.distance_to_land_km, 1)}</td><td className="mono">{num(c.detection_score)}</td></tr>)
                : ctx.detections.map((d) => <tr key={d.id}><td>{d.classification_label}</td><td className="mono">{num(d.area_km2)}</td><td colSpan={4}><Missing>Characterisation is returned only by a fresh M1 run</Missing></td><td className="mono">—</td><td className="mono">{num(d.detection_score)}</td></tr>)}
            </tbody>
          </table>
        </Scroller>
      </>
    )
  }
  if (kind === 'environment') {
    return (
      <>
        {([['ERA5 wind', env.windData], ['CMEMS currents', env.currentsData]] as [string, EnvironmentSummary | null][]).map(([label, d]) => (
          <div key={label}>
            <h4 className="p5-h4">{label}</h4>
            {d ? <KvU rows={[['Variables', d.variables.join(', ')], ['Time steps', d.time_steps != null ? String(d.time_steps) : null], ['Array shape', JSON.stringify(d.shape)]]} /> : <p className="hint"><CanonStatus s="not-executed" /> Not retrieved.</p>}
          </div>
        ))}
        <p className="hint">The backend returns summaries only, no gridded values, so no field is plotted.</p>
      </>
    )
  }
  if (kind === 'drift') {
    const a = drift.analysis, f = drift.forecastData
    if (!a) return null
    return (
      <>
        <KvU rows={[['Analysis ID', a.id], ['Origin centroid', a.probable_origin_centroid ? `${fmtLat(a.probable_origin_centroid.lat)} ${fmtLon(a.probable_origin_centroid.lon)}` : null, 'No origin geometry returned'], ['Release window', `${utc(a.release_start)} → ${utc(a.release_end)}`], ['Observation time', utc(a.observation_time)], ['Uncertainty', `± ${a.uncertainty_km} km`], ['Ensemble size', String(a.ensemble_size)], ['Model version', a.model_version]]} />
        <h4 className="p5-h4">Forecast</h4>
        {f ? <Scroller label="Forecast"><table className="tbl"><thead><tr><th scope="col">Horizon</th><th scope="col">Centroid</th><th scope="col">Spread km</th></tr></thead><tbody>{Object.entries(f.forecasts).map(([h, v]) => <tr key={h}><td>{h}</td><td className="mono">{fmtLat(v.centroid.lat)} {fmtLon(v.centroid.lon)}</td><td className="mono">{num(v.spread_km, 1)}</td></tr>)}</tbody></table></Scroller> : <p className="hint">No forecast has been requested for this analysis.</p>}
      </>
    )
  }
  if (kind === 'vessels') {
    const cs = vessels.data?.candidates ?? []
    return (
      <>
        <Scroller label="Candidate vessels">
          <table className="tbl">
            <thead><tr><th scope="col">Vessel</th><th scope="col">MMSI</th><th scope="col">Best-fit hour</th><th scope="col">Spatial</th><th scope="col">Temporal</th><th scope="col">Trajectory</th><th scope="col">Behaviour</th><th scope="col">Overall</th></tr></thead>
            <tbody>{cs.map((v, i) => <tr key={vesselKey(v, i)}><td><Link className="id-link" to={`/investigations/${id}/vessels/${encodeURIComponent(vesselKey(v, i))}`}>{vesselLabel(v)}</Link></td><td className="mono">{v.mmsi ?? '—'}</td><td className="mono">{v.best_fit_hour ?? '—'}</td><td className="mono">{num(v.spatial_score)}</td><td className="mono">{num(v.temporal_score)}</td><td className="mono">{num(v.trajectory_score)}</td><td className="mono">{num(v.behavioural_score)}</td><td className="mono">{num(v.overall_score)}</td></tr>)}</tbody>
          </table>
        </Scroller>
        <p className="hint">Candidate scores rank spatio-temporal agreement with the reconstructed origin. They are not evidence of responsibility.</p>
      </>
    )
  }
  if (kind === 'pasha') {
    const r = pasha.result
    if (!r) return null
    return (
      <>
        <div className="p4-outcome"><span>Backend decision</span><BackendStatus status={r.outcome.status} /></div>
        <p className="p4-reason">{r.outcome.reason}</p>
        {r.candidates.map((c, i) => (
          <div className="p5-cand" key={vesselKey(c, i)}>
            <div><b>{vesselLabel(c)}</b> <BackendStatus status={c.status} /></div>
            <ul className="gates">
              <Gate label="Spatial test" pass={c.falsification?.spatial_test} /><Gate label="Temporal test" pass={c.falsification?.temporal_test} />
              <Gate label="Drift test" pass={c.falsification?.drift_test} /><Gate label="Physical test" pass={c.falsification?.physical_test} />
            </ul>
            <small className="mono">Physical consistency score {num(c.falsification?.physical_consistency_score, 4)} · plausibility {c.physical_plausibility ? (c.physical_plausibility.plausible ? 'plausible' : 'not plausible') : 'not returned'}</small>
          </div>
        ))}
        <p className="hint"><Link className="link-more" to={`/investigations/${id}/pasha/hypotheses?run=${r.run_id}`}>Compare hypotheses <ArrowRight size={13} aria-hidden="true" /></Link> · <Link className="link-more" to={`/investigations/${id}/pasha/replay?run=${r.run_id}`}>Replay detail <ArrowRight size={13} aria-hidden="true" /></Link></p>
      </>
    )
  }
  return <ReportList reports={reports.reports} />
}

function Details({ entry }: { entry: EvidenceEntry }) {
  const it = entry.item
  if (!it) return null
  return (
    <div className="p5-stack">
      <Kv rows={[['Category', KIND_META[entry.kind].title], ['Stage', KIND_META[entry.kind].stage], ['Recorded', it.timestamp ? utc(it.timestamp) : 'No timestamp returned by the backend']]} />
      <div><OriginTag origin={it.origin} /></div>
      <section aria-label="References"><h4 className="p5-h4">Input / output references</h4>
        {it.ids.length ? <Kv rows={it.ids} /> : <p className="hint">The backend returns no identifiers for this evidence.</p>}</section>
      <section aria-label="Uncertainty and scoring"><h4 className="p5-h4">Confidence / uncertainty</h4>
        {it.metrics.length ? <><Kv rows={it.metrics} /><p className="hint">Shown as returned. The backend supplies no High / Medium / Low classification.</p></> : <p className="hint">Confidence information not provided by backend.</p>}</section>
      <section aria-label="Provenance"><h4 className="p5-h4">Provenance</h4>
        {it.provenance.length === 0 ? <p className="hint">No provenance block is returned for this evidence.</p> : (
          <details className="expand" open><summary>View provenance ({it.provenance.length})</summary><div className="expand__body">{it.provenance.map((p) => <ProvenanceBlock key={p.title} {...p} cached={it.origin === 'browser-cached'} />)}</div></details>
        )}</section>
      <RawData data={it.raw} />
    </div>
  )
}

function ProvenanceOverview({ entries }: { entries: EvidenceEntry[] }) {
  const have = entries.flatMap((e) => (e.item?.provenance ?? []).map((p) => ({ ...p, cached: e.item?.origin === 'browser-cached' })))
  const without = entries.filter((e) => e.item && e.item.provenance.length === 0)
  return (
    <>
      {have.length === 0 ? <p className="hint">No provenance blocks are available yet. They appear once M1, M2 or M3 results exist.</p> : <div className="prov-grid">{have.map((p) => <ProvenanceBlock key={p.title} {...p} />)}</div>}
      {without.length > 0 && <p className="hint">No provenance block is returned by the backend for: {without.map((e) => KIND_META[e.kind].title).join(', ')}.</p>}
    </>
  )
}

export default function EvidencePage() {
  const { id = '' } = useParams()
  const ws = useWorkspace(id)
  const pasha = usePasha(ws)
  const reports = useReports(ws, pasha)
  const [params, setParams] = useSearchParams()
  const entries = useMemo(() => buildEvidence(ws, pasha, reports.reports), [ws, pasha, reports.reports])
  const have = entries.filter((e) => e.item)
  const raw = params.get('item')
  const view: View = raw === 'provenance' ? 'provenance' : isKind(raw) && entries.find((e) => e.kind === raw)?.item ? raw : 'timeline'
  const select = (v: View) => setParams((p) => { const n = new URLSearchParams(p); n.set('item', v); return n }, { replace: true })
  const entry = isKind(view) ? entries.find((e) => e.kind === view) ?? null : null
  const showMap = view === 'detection' || view === 'drift' || view === 'vessels' || view === 'pasha'
  const layers = useMemo(() => buildLayers({ ctx: ws.ctx, analysis: ws.drift.analysis, candidates: view === 'pasha' ? pasha.result?.candidates ?? [] : ws.vessels.data?.candidates ?? [], showCounterfactual: view === 'pasha' }), [ws.ctx, ws.drift.analysis, ws.vessels.data, pasha.result, view])
  const loading = ws.ctx.incident.status === 'success' && (pasha.stored.status === 'loading' && !!pasha.runId || reports.list.status === 'loading' || ws.ctx.detections.length === 0 && ws.ctx.observations.status === 'loading')

  return (
    <P5Shell ws={ws} title="Evidence Workspace" lead="Every result this investigation holds, with its provenance. Trace each conclusion back to what the backend actually returned." runId={pasha.runId} evidenceCount={{ have: have.length, total: entries.length }} report={reportState(reports)}>
      <div className="p5-ev">
        <nav className="card p5-ev__nav" aria-label="Evidence categories">
          <div className="card__body">
            <button type="button" className={`p5-navi${view === 'timeline' ? ' is-on' : ''}`} aria-current={view === 'timeline' ? 'page' : undefined} onClick={() => select('timeline')}>Timeline</button>
            {have.map((e) => <button key={e.kind} type="button" className={`p5-navi${view === e.kind ? ' is-on' : ''}`} aria-current={view === e.kind ? 'page' : undefined} onClick={() => select(e.kind)}><span>{KIND_META[e.kind].title}</span><small>{KIND_META[e.kind].stage}</small></button>)}
            <button type="button" className={`p5-navi${view === 'provenance' ? ' is-on' : ''}`} aria-current={view === 'provenance' ? 'page' : undefined} onClick={() => select('provenance')}>Provenance</button>
            {entries.some((e) => !e.item) && (
              <div className="p5-navi__off"><h3>Not available</h3>
                <ul>{entries.filter((e) => !e.item).map((e) => <li key={e.kind}><Circle size={8} aria-hidden="true" /> <span>{KIND_META[e.kind].title}</span><CanonStatus s={e.state} /></li>)}</ul></div>
            )}
          </div>
        </nav>

        <section className="card p5-ev__main" aria-label="Evidence content">
          <div className="card__head"><h2 className="card__title">{view === 'timeline' ? 'Evidence timeline' : view === 'provenance' ? 'Provenance' : KIND_META[view].title}</h2>{entry?.item && <OriginTag origin={entry.item.origin} />}</div>
          <div className="card__body p5-stack">
            {loading && <SkeletonRows rows={3} />}
            {reports.list.status === 'error' && <ErrorState compact error={reports.list.error} onRetry={reports.list.retry} title="Report list unavailable" />}
            {showMap && <InvestigationMap layers={layers} />}
            {view === 'timeline' && <Timeline entries={entries} select={select} />}
            {view === 'provenance' && <ProvenanceOverview entries={entries} />}
            {isKind(view) && <Body kind={view} ws={ws} pasha={pasha} reports={reports} />}
          </div>
        </section>

        <aside className="card p5-ev__side" aria-label="Evidence details">
          <div className="card__head"><h2 className="card__title">Details &amp; provenance</h2></div>
          <div className="card__body">
            {entry ? <Details entry={entry} /> : (
              <div className="p5-stack">
                <p className="hint">Select an evidence category to inspect its identifiers, uncertainty and provenance without leaving the investigation.</p>
                <Kv rows={[['Categories available', `${have.length} of ${entries.length}`], ['PASHA run in view', pasha.runId]]} />
              </div>
            )}
          </div>
        </aside>
      </div>
    </P5Shell>
  )
}
