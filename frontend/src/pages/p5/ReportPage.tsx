import { useMemo, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AlertTriangle, FileText, Printer } from 'lucide-react'
import { InvestigationMap } from '../../components/investigation/InvestigationMap'
import { Busy, OpError, ProvenanceBlock, RunButton, num, utc } from '../../components/investigation/parts'
import { CanonStatus } from '../../components/CanonStatus'
import { P5Shell } from '../../components/p5/P5Shell'
import { ReportList } from '../../components/p5/ReportActions'
import { Missing, Scroller } from '../../components/p5/parts'
import { BackendStatus, Gate } from '../../components/p4/parts'
import { StatusPill } from '../../components/StatusPill'
import { useWorkspace } from '../../hooks/useWorkspace'
import { useElapsed, usePasha } from '../../hooks/usePasha'
import { reportState, useReports } from '../../hooks/useReports'
import { useIncidents } from '../../hooks/useMissionData'
import { KIND_META, buildEvidence } from '../../lib/evidence'
import { buildLayers, vesselKey, vesselLabel } from '../../lib/p4'
import { fmtLat, fmtLon, formatDateTime, outerRings, ringCenter } from '../../lib/format'

function Sec({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return <section className="rpt__sec" aria-labelledby={`rpt-${n}`}><h2 id={`rpt-${n}`}><span>{String(n).padStart(2, '0')}</span>{title}</h2>{children}</section>
}
const Row = ({ k, v, why }: { k: string; v: ReactNode | null | undefined; why?: string }) => (
  <div className="rpt__row"><dt>{k}</dt><dd>{v !== null && v !== undefined && v !== '' ? v : <Missing>{why}</Missing>}</dd></div>
)

export default function ReportPage() {
  const { id = '' } = useParams()
  const ws = useWorkspace(id)
  const pasha = usePasha(ws)
  const reports = useReports(ws, pasha)
  const incidents = useIncidents()
  const { ctx, detection, env, drift, vessels } = ws
  const entries = useMemo(() => buildEvidence(ws, pasha, reports.reports), [ws, pasha, reports.reports])
  const have = entries.filter((e) => e.item).length
  const rState = reportState(reports)
  const running = reports.gen.status === 'running'
  const elapsed = useElapsed(running)

  const inc = ws.incident
  const created = incidents.data?.incidents.find((i) => i.id === id)?.created_at
  const ring = inc ? outerRings(inc.bbox)[0] : undefined
  const centre = ring ? ringCenter(ring) : null
  const obs = ctx.input ?? ctx.observations.data?.observations[0] ?? null
  const scene = ctx.scenes.data?.scenes[0]
  const dres = detection.result
  const a = drift.analysis
  const f = drift.forecastData
  const pr = pasha.result
  const cands = vessels.data?.candidates ?? []
  const m4 = ws.stages.find((s) => s.key === 'm4')
  const slickCount = dres ? dres.diagnostics.accepted_count ?? dres.candidates.length : ctx.detections.length
  const topScore = dres ? Math.max(...dres.candidates.map((c) => c.detection_score ?? -Infinity)) : ctx.slick?.detection.detection_score
  const leading = pr?.outcome.leading_candidate ? pr.candidates.find((c) => c.vessel_key === pr.outcome.leading_candidate) : undefined

  const detLayers = useMemo(() => ({ ...buildLayers({ ctx, analysis: null, candidates: [] }) }), [ctx])
  const driftLayers = useMemo(() => buildLayers({ ctx, analysis: a, candidates: cands }), [ctx, a, cands])
  const provs = entries.flatMap((e) => (e.item?.provenance ?? []).map((p) => ({ ...p, cached: e.item?.origin === 'browser-cached' })))
  const unavailable = entries.filter((e) => !e.item)

  const actions = (
    <section className="card p5-noprint p5-act" aria-label="Report generation">
      <div className="card__head"><h2 className="card__title">Report generation</h2><CanonStatus s={rState} /></div>
      <div className="card__body p5-stack">
        <p className="hint">The backend can render an evidence-dossier PDF from a stored PASHA run (<span className="mono">POST /reports/&#123;incident&#125;/generate</span>). The preview below is assembled in the browser from the same stored results and is not the PDF.</p>
        <div className="p5-rowact">
          <RunButton busy={running} disabled={!!reports.blocked} why={reports.blocked ?? undefined} onClick={() => void reports.generate()}><FileText size={15} aria-hidden="true" /> Generate report</RunButton>
          <button type="button" className="btn" onClick={() => window.print()}><Printer size={15} aria-hidden="true" /> Print preview</button>
        </div>
        {reports.blocked && <div className="callout callout--muted" role="status"><AlertTriangle size={15} aria-hidden="true" /><span>{reports.blocked} {!pasha.runId && <Link className="link-more" to={`/investigations/${id}/pasha`}>Open PASHA</Link>}</span></div>}
        <div aria-live="polite">{running && <Busy>GENERATING — the backend is rendering the PDF. No progress is reported. Elapsed {elapsed}s.</Busy>}</div>
        {reports.gen.status === 'error' && <OpError error={reports.gen.error} onRetry={() => void reports.generate()} title="Report generation failed" />}
        {reports.gen.status === 'success' && <div className="callout callout--ok" role="status"><span>Report generated · <span className="mono">{reports.gen.data.report_id.slice(0, 8)}</span> · decision status {reports.gen.data.decision_status}</span></div>}
        {reports.list.status === 'error' && <OpError error={reports.list.error} onRetry={reports.list.retry} title="Stored reports could not be listed" />}
        {reports.reports.length > 0 ? <ReportList reports={reports.reports} /> : reports.list.status === 'success' && <p className="hint">No report has been generated for this investigation yet.</p>}
      </div>
    </section>
  )

  return (
    <P5Shell ws={ws} title="Investigation Report" lead="A readable statement of what was detected, reconstructed, correlated and tested, and what could not be established." runId={pasha.runId} evidenceCount={{ have, total: entries.length }} report={rState} actions={actions}>
      <article className="rpt" aria-label="Investigation report preview">
        <header className="rpt__head">
          <span className="rpt__brand">VARUNA NETRA</span>
          <h1>Maritime Intelligence Investigation Report</h1>
          <dl className="rpt__meta">
            <Row k="Investigation ID" v={<span className="mono">{id}</span>} />
            <Row k="Incident ID" v={<span className="mono">{id}</span>} />
            <Row k="Incident" v={inc?.name} />
            <Row k="Created" v={created ? `${formatDateTime(created)} UTC` : null} why="Not in the first 100 incident records" />
            <Row k="Status" v={inc ? <StatusPill status={inc.status} /> : null} />
            <Row k="Data basis" v={<CanonStatus s="live" />} />
          </dl>
        </header>

        <Sec n={1} title="Executive summary">
          <ul className="rpt__list">
            <li>{obs || scene ? <>Observed: a Sentinel-1 observation ({obs?.product_id ?? scene?.product_id}) acquired {utc(obs?.acquisition_time ?? scene?.acquisition_time)} is linked to this investigation.</> : <>Unavailable: no SAR observation is linked to this investigation.</>}</li>
            <li>{slickCount ? <>Detected: {slickCount} slick candidate(s) accepted{typeof topScore === 'number' && Number.isFinite(topScore) ? <>; highest backend detection score {topScore.toFixed(3)}</> : null}.</> : <>Unavailable: M1 detection has not produced a result.</>}</li>
            <li>{a ? <>Reconstructed: a candidate origin region {a.probable_origin_centroid ? <>centred near {fmtLat(a.probable_origin_centroid.lat)} {fmtLon(a.probable_origin_centroid.lon)} </> : null}with an origin uncertainty of ±{a.uncertainty_km} km (release window {utc(a.release_start)} to {utc(a.release_end)}).</> : <>Unavailable: no drift reconstruction is recorded.</>}</li>
            <li>{vessels.data ? <>Correlated: {vessels.data.candidate_count} candidate vessel(s) scored for spatio-temporal agreement with the reconstructed origin. Agreement is not evidence of responsibility.</> : <>Unavailable: vessel correlation has not been run{m4?.state === 'unavailable' ? ` (${m4.note})` : ''}.</>}</li>
            <li>{pr ? <>Hypothesis test: the backend decision gate returned <b>{pr.outcome.status}</b>. {pr.outcome.reason}{leading ? <> Leading candidate under this decision: {vesselLabel(leading)}. This is a ranking of hypotheses; it is not a finding that the vessel caused the release.</> : null}</> : <>Unavailable: no PASHA counterfactual run is stored.</>}</li>
          </ul>
        </Sec>

        <Sec n={2} title="Incident">
          <dl className="rpt__dl">
            <Row k="Location (area centre)" v={centre ? `${fmtLat(centre[1])} ${fmtLon(centre[0])}` : null} />
            <Row k="Observation time" v={utc(ctx.observationTime)} />
            <Row k="Detection run retrieved" v={utc(dres?.provenance.retrieved_at)} why="No timestamp returned by the backend" />
            <Row k="Observation" v={obs ? <span className="mono">{obs.id}</span> : null} why="No observation linked" />
            <Row k="Scene" v={scene ? <span className="mono">{scene.product_id}</span> : obs?.product_id} why="No scene persisted" />
            <Row k="Polarisation" v={obs?.polarization ?? scene?.polarization} />
          </dl>
        </Sec>

        <Sec n={3} title="SAR detection">
          {slickCount === 0 ? <p className="hint">No detection evidence is available.</p> : (
            <Scroller label="Detection candidates">
              <table className="tbl"><thead><tr><th scope="col">Label</th><th scope="col">Area km²</th><th scope="col">Length km</th><th scope="col">Width km</th><th scope="col">Contrast dB</th><th scope="col">Score</th></tr></thead>
                <tbody>{dres ? dres.candidates.map((c, i) => <tr key={i}><td>{c.classification_label}{c.rejected_reason ? ` (rejected: ${c.rejected_reason})` : ''}</td><td className="mono">{num(c.area_km2)}</td><td className="mono">{num(c.length_km)}</td><td className="mono">{num(c.width_km)}</td><td className="mono">{num(c.contrast_db)}</td><td className="mono">{num(c.detection_score)}</td></tr>)
                  : ctx.detections.map((d) => <tr key={d.id}><td>{d.classification_label}</td><td className="mono">{num(d.area_km2)}</td><td colSpan={3}><Missing>Returned by a fresh M1 run only</Missing></td><td className="mono">{num(d.detection_score)}</td></tr>)}</tbody></table>
            </Scroller>
          )}
          <InvestigationMap layers={detLayers} />
        </Sec>

        <Sec n={4} title="Environment">
          {env.windData || env.currentsData ? (
            <dl className="rpt__dl">
              <Row k="Wind (ERA5)" v={env.windData ? `${env.windData.variables.join(', ')} · ${env.windData.time_steps ?? '—'} time step(s)` : null} why="Not retrieved" />
              <Row k="Currents (CMEMS)" v={env.currentsData ? `${env.currentsData.variables.join(', ')} · ${env.currentsData.time_steps ?? '—'} time step(s)` : null} why="Not retrieved" />
            </dl>
          ) : <p className="hint">Unavailable: environmental summaries have not been retrieved. Drift forcing provenance, if present, appears in section 10.</p>}
        </Sec>

        <Sec n={5} title="Drift reconstruction">
          {a ? (
            <>
              <dl className="rpt__dl">
                <Row k="Probable origin (centroid)" v={a.probable_origin_centroid ? `${fmtLat(a.probable_origin_centroid.lat)} ${fmtLon(a.probable_origin_centroid.lon)}` : null} why="No origin geometry returned" />
                <Row k="Uncertainty" v={`± ${a.uncertainty_km} km`} />
                <Row k="Release window" v={`${utc(a.release_start)} → ${utc(a.release_end)}`} />
                <Row k="Ensemble / model" v={`${a.ensemble_size} members · ${a.model_version}`} />
                <Row k="Forecast" v={f ? Object.entries(f.forecasts).map(([h, v]) => `${h}: ${fmtLat(v.centroid.lat)} ${fmtLon(v.centroid.lon)} (spread ${num(v.spread_km, 1)} km)`).join(' · ') : null} why="No forecast requested" />
              </dl>
              <InvestigationMap layers={driftLayers} />
            </>
          ) : <p className="hint">Unavailable: no drift analysis is recorded.</p>}
        </Sec>

        <Sec n={6} title="Vessel correlation">
          <p className="rpt__note">AIS availability: {vessels.data ? 'AIS data was available for the correlation window.' : m4 ? `${m4.state === 'unavailable' ? 'Unavailable — ' : 'Not established — '}${m4.note}` : 'Not established.'}</p>
          {cands.length > 0 && (
            <Scroller label="Candidate vessels"><table className="tbl"><thead><tr><th scope="col">Candidate</th><th scope="col">MMSI</th><th scope="col">Spatial</th><th scope="col">Temporal</th><th scope="col">Trajectory</th><th scope="col">Behaviour</th><th scope="col">Overall</th></tr></thead>
              <tbody>{cands.map((v, i) => <tr key={vesselKey(v, i)}><td>{vesselLabel(v)}</td><td className="mono">{v.mmsi ?? '—'}</td><td className="mono">{num(v.spatial_score)}</td><td className="mono">{num(v.temporal_score)}</td><td className="mono">{num(v.trajectory_score)}</td><td className="mono">{num(v.behavioural_score)}</td><td className="mono">{num(v.overall_score)}</td></tr>)}</tbody></table></Scroller>
          )}
        </Sec>

        <Sec n={7} title="PASHA / counterfactual">
          {pr ? (
            <>
              <p><BackendStatus status={pr.outcome.status} /> <span className="rpt__reason">{pr.outcome.reason}</span></p>
              <dl className="rpt__dl"><Row k="Run ID" v={<span className="mono">{pr.run_id}</span>} /><Row k="Decision margin" v={pr.outcome.margin !== null ? pr.outcome.margin.toFixed(4) : null} why="Not computed" /></dl>
              {pr.candidates.map((c, i) => (
                <div className="rpt__cand" key={vesselKey(c, i)}>
                  <h3>Hypothesis: {vesselLabel(c)} <BackendStatus status={c.status} /></h3>
                  <ul className="gates"><Gate label="Spatial test" pass={c.falsification?.spatial_test} /><Gate label="Temporal test" pass={c.falsification?.temporal_test} /><Gate label="Drift test" pass={c.falsification?.drift_test} /><Gate label="Physical test" pass={c.falsification?.physical_test} /></ul>
                  <dl className="rpt__dl">
                    <Row k="Physical consistency score" v={num(c.falsification?.physical_consistency_score, 4)} why="Not returned" />
                    <Row k="Physical plausibility" v={c.physical_plausibility ? `${c.physical_plausibility.plausible ? 'Plausible' : 'Not plausible'}${c.physical_plausibility.reason ? ` — ${c.physical_plausibility.reason}` : ''}` : null} why="Not returned" />
                    <Row k="Estimated release" v={c.physical_plausibility?.estimated_spill_tonnes_low !== undefined ? `${c.physical_plausibility.estimated_spill_tonnes_low}–${c.physical_plausibility.estimated_spill_tonnes_high ?? '?'} t (vessel capacity ${c.physical_plausibility.vessel_capacity_tonnes ?? 'not returned'} t)` : null} why="Not returned" />
                  </dl>
                  {c.falsification && c.falsification.reasons.length > 0 && <ul className="rpt__list">{c.falsification.reasons.map((r, j) => <li key={j}>{r}</li>)}</ul>}
                </div>
              ))}
              <p className="rpt__note">Scores are physical consistency scores, not probabilities of responsibility. The backend returned no simulated trajectory geometry.</p>
            </>
          ) : <p className="hint">Unavailable: no PASHA run is stored for this drift analysis.</p>}
        </Sec>

        <Sec n={8} title="Evidence">
          <Scroller label="Evidence references">
            <table className="tbl"><thead><tr><th scope="col">Category</th><th scope="col">State</th><th scope="col">Source</th><th scope="col">Recorded</th><th scope="col">References</th></tr></thead>
              <tbody>{entries.map((e) => <tr key={e.kind}><td><Link className="id-link" to={`/investigations/${id}/evidence?item=${e.kind}${pasha.runId ? `&run=${pasha.runId}` : ''}`}>{KIND_META[e.kind].title}</Link></td><td><CanonStatus s={e.state} /></td><td>{e.item ? (e.item.origin === 'backend' ? 'Backend' : 'Browser-cached') : '—'}</td><td className="mono">{e.item?.timestamp ? utc(e.item.timestamp) : '—'}</td><td className="mono rpt__ids">{e.item?.ids.map(([k, v]) => `${k}: ${v.slice(0, 8)}`).join(' · ') || '—'}</td></tr>)}</tbody></table>
          </Scroller>
        </Sec>

        
        <Sec n={9} title="Limitations">
          <ul className="rpt__list">
            {unavailable.map((e) => <li key={e.kind}>{KIND_META[e.kind].title}: {e.state === 'failed' ? 'failed' : e.state === 'unavailable' ? 'unavailable' : 'not executed'} — {e.reason}</li>)}
            <li>The backend returns no confidence rating for any stage; scores and uncertainties are shown as raw values.</li>
            <li>Environmental summaries carry no gridded values, and PASHA returns no trajectory geometry, so neither is drawn.</li>
            <li>Standing limitations stated by the backend dossier: M1 uses a deterministic CFAR baseline; geocoding is approximate (GCP affine, no terrain correction) and valid over open water only; the release window derives from an externally supplied slick-age estimate; AIS gaps are supporting evidence only.</li>
          </ul>
        </Sec>
      
<Sec n={10} title="Provenance">
          {provs.length ? <div className="prov-grid">{provs.map((p) => <ProvenanceBlock key={p.title} {...p} />)}</div> : <p className="hint">No provenance blocks are available yet.</p>}
        </Sec>
        </article>
    </P5Shell>
  )
}
