import { useMemo } from 'react'
import { Link, NavLink, useParams } from 'react-router-dom'
import { ArrowRight, FileSearch, FileText } from 'lucide-react'
import { M1Panel } from '../components/investigation/M1Panel'
import { M2Panel } from '../components/investigation/M2Panel'
import { M3Panel } from '../components/investigation/M3Panel'
import { M4Panel } from '../components/investigation/M4Panel'
import { InvestigationMap, type MapLayers } from '../components/investigation/InvestigationMap'
import { Kv, ProvenanceBlock, StageBadge, utc } from '../components/investigation/parts'
import { EmptyState, ErrorState, SkeletonRows } from '../components/StateViews'
import { StatusPill } from '../components/StatusPill'
import { useDetection, useDrift, useEnvironment, useInvestigation, useInvestigationProgress, useVessels } from '../hooks/useInvestigation'
import { useApi } from '../hooks/useApi'
import { listPashaRuns } from '../api'
import { useIncidents, useProviders } from '../hooks/useMissionData'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { bboxRing } from '../lib/projection'
import { fmtLat, fmtLon, outerRings, ringCenter } from '../lib/format'
import type { StageKey } from '../lib/investigation'
import { TAGLINE } from '../config/site'
import type { ProvenanceDump } from '../types/api'

const MODULES: StageKey[] = ['m1', 'm2', 'm3', 'm4']
const isModule = (v: string | undefined): v is StageKey => !!v && (MODULES as string[]).includes(v)

export default function InvestigationWorkspacePage() {
  const { id = '', module } = useParams()
  const active = isModule(module) ? module : null
  const ctx = useInvestigation(id)
  const providers = useProviders()
  const incidents = useIncidents()
  const detection = useDetection(ctx, id)
  const env = useEnvironment(ctx)
  const drift = useDrift(ctx, id)
  const vessels = useVessels(ctx, drift.analysis?.id)
  const pashaRuns = useApi((sg) => listPashaRuns(id, sg), [id])
  const stages = useInvestigationProgress({ ctx, providers: providers.data, detection, env, drift, vessels })
  const inc = ctx.incident.data?.incident
  const m5Runs = (pashaRuns.data?.runs ?? []).filter((r) => r.analysis_id === drift.analysis?.id).length
  const m5Ready = !!vessels.data && vessels.data.candidate_count > 0
  const m5Pill = <StageBadge state={m5Runs ? 'completed' : m5Ready ? 'ready' : 'locked'} />
  useDocumentTitle(inc ? `${inc.name} · Workspace` : 'Investigation Workspace')

  const layers = useMemo<MapLayers>(() => {
    const a = drift.analysis, fc = drift.forecastData
    return {
      incident: inc ? outerRings(inc.bbox) : [],
      scene: ctx.input?.bbox ? [bboxRing(ctx.input.bbox)] : [],
      slick: ctx.detections.flatMap((d) => outerRings(d.geometry)),
      env: env.request && (env.windData || env.currentsData) ? [bboxRing([env.request.minlon, env.request.minlat, env.request.maxlon, env.request.maxlat])] : [],
      origin: a?.probable_origin_geometry ? outerRings(a.probable_origin_geometry) : [],
      originCentroid: a?.probable_origin_centroid ?? null,
      uncertaintyKm: a?.probable_origin_centroid ? a.uncertainty_km : null,
      forecasts: fc ? Object.entries(fc.forecasts).map(([label, f]) => ({ label, rings: outerRings(f.geometry), centroid: f.centroid })) : [],
      vessels: (vessels.data?.candidates ?? []).flatMap((v, i) => v.best_fit_position ? [{ id: v.vessel_key ?? v.mmsi ?? String(i), label: v.name ?? v.mmsi ?? 'unnamed vessel', lon: v.best_fit_position.lon, lat: v.best_fit_position.lat }] : []),
    }
  }, [inc, ctx.input, ctx.detections, env.request, env.windData, env.currentsData, drift.analysis, drift.forecastData, vessels.data])

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

  const created = incidents.data?.incidents.find((i) => i.id === id)?.created_at
  const ring = inc ? outerRings(inc.bbox)[0] : undefined
  const centre = ring ? ringCenter(ring) : null
  const stage = active ? stages.find((s) => s.key === active) : undefined
  const next = stages.find((s) => s.state === 'ready' || s.state === 'failed')

  const evidence: { title: string; p: ProvenanceDump; cached?: boolean }[] = []
  const wantAll = active === null
  if ((wantAll || active === 'm1') && detection.result) evidence.push({ title: 'M1 · detection', p: detection.result.provenance })
  if ((wantAll || active === 'm2') && env.windData) evidence.push({ title: 'M2 · wind', p: env.windData.provenance, cached: env.wind.status !== 'success' })
  if ((wantAll || active === 'm2') && env.currentsData) evidence.push({ title: 'M2 · currents', p: env.currentsData.provenance, cached: env.currents.status !== 'success' })
  if ((wantAll || active === 'm3') && drift.analysis?.provenance.wind) evidence.push({ title: 'M3 · wind forcing', p: drift.analysis.provenance.wind })
  if ((wantAll || active === 'm3') && drift.analysis?.provenance.current) evidence.push({ title: 'M3 · current forcing', p: drift.analysis.provenance.current })

  return (
    <>
      <header className="mc-head">
        <div>
          <span className="eyebrow">{TAGLINE}</span>
          <h1 style={{ marginTop: 10 }}>Investigation Workspace</h1>
          <p>Detection → environment → drift → vessel correlation, run one module at a time.</p>
        </div>
        <div className="p5-nav"><Link to="/history" className="btn btn--sm">History</Link><Link to="/investigations/new" className="btn">New investigation</Link></div>
      </header>

      <section className="card inv-head" aria-label="Investigation summary">
        <div className="card__body">
          <div className="inv-head__title">
            <h2>{inc?.name}</h2>{inc && <StatusPill status={inc.status} />}
          </div>
          <Kv rows={[
            ['Investigation ID', id], ['Created', utc(created)], ['Centre', centre ? `${fmtLat(centre[1])} ${fmtLon(centre[0])}` : null],
            ['SAR scene', ctx.input?.product_id ?? ctx.scenes.data?.scenes[0]?.product_id ?? 'None linked'], ['Acquired', utc(ctx.observationTime)],
          ]} />
        </div>
      </section>

      <nav className="pipeline" aria-label="Investigation pipeline">
        <NavLink to={`/investigations/${id}`} end className={({ isActive }) => `pipe pipe--overview${isActive ? ' is-active' : ''}`}><span className="pipe__code">All</span><span className="pipe__title">Overview</span></NavLink>
        {stages.map((s) => (
          <NavLink key={s.key} to={`/investigations/${id}/${s.key}`} className={({ isActive }) => `pipe pipe--${s.state}${isActive ? ' is-active' : ''}`}>
            <span className="pipe__code">{s.code}</span><span className="pipe__title">{s.title}</span><StageBadge state={s.state} />
          </NavLink>
        ))}
        <NavLink to={`/investigations/${id}/pasha`} className={`pipe pipe--${m5Runs ? 'completed' : m5Ready ? 'ready' : 'locked'}`}><span className="pipe__code">M5</span><span className="pipe__title">PASHA Simulation</span>{m5Pill}</NavLink>
        <NavLink to={`/investigations/${id}/evidence`} className="pipe pipe--overview"><span className="pipe__code"><FileSearch size={13} aria-hidden="true" /></span><span className="pipe__title">Evidence</span></NavLink>
        <NavLink to={`/investigations/${id}/report`} className="pipe pipe--overview"><span className="pipe__code"><FileText size={13} aria-hidden="true" /></span><span className="pipe__title">Report</span></NavLink>
      </nav>

      <div className="inv-grid">
        <section className="card" aria-label="Investigation map">
          <div className="card__head"><h2 className="card__title">Map</h2></div>
          <div className="card__body"><InvestigationMap layers={layers} /></div>
        </section>

        <section className="card" aria-label={stage ? `${stage.code} ${stage.title}` : 'Overview'}>
          <div className="card__head">
            <h2 className="card__title">{stage ? `${stage.code} · ${stage.title}` : 'Overview'}</h2>
            {stage && <StageBadge state={stage.state} />}
          </div>
          <div className="card__body">
            {stage && <p className="hint stage-note">{stage.note}</p>}
            {active === 'm1' && stage && <M1Panel ctx={ctx} detection={detection} stage={stage} />}
            {active === 'm2' && stage && <M2Panel env={env} stage={stage} setAgeMax={(h) => ctx.patchRefs({ ageMax: h })} />}
            {active === 'm3' && stage && <M3Panel ctx={ctx} drift={drift} stage={stage} />}
            {active === 'm4' && stage && <M4Panel vessels={vessels} stage={stage} />}
            {active === 'm4' && vessels.data && vessels.data.candidate_count > 0 && <p style={{ marginTop: 14 }}><Link className="btn btn--sm" to={`/investigations/${id}/vessels`}>Open vessel intelligence <ArrowRight size={13} /></Link></p>}
            {!active && (
              <ul className="ov">
                {stages.map((s) => (
                  <li key={s.key}>
                    <div><strong>{s.code} · {s.title}</strong><StageBadge state={s.state} /></div>
                    <p>{s.note}</p>
                    <Link to={`/investigations/${id}/${s.key}`} className="link-more">Open <ArrowRight size={13} /></Link>
                  </li>
                ))}
                <li><div><strong>M5 · PASHA Simulation</strong>{m5Pill}</div><p>{m5Runs ? `${m5Runs} stored counterfactual run(s) for this drift analysis.` : m5Ready ? 'Candidates are scored; run the counterfactual replay.' : 'Needs scored candidate vessels from M4.'}</p><Link to={`/investigations/${id}/pasha`} className="link-more">Open <ArrowRight size={13} /></Link></li>
              </ul>
            )}
            {!active && next && <p style={{ marginTop: 14 }}><Link className="btn btn--primary" to={`/investigations/${id}/${next.key}`}>Next: {next.code} {next.title} <ArrowRight size={15} /></Link></p>}
          </div>
        </section>
      </div>

      <section className="card" style={{ marginTop: 16 }} aria-label="Evidence and provenance">
        <div className="card__head"><h2 className="card__title">Evidence &amp; provenance</h2></div>
        <div className="card__body">
          {evidence.length === 0
            ? <p className="hint">No provenance yet. It appears here as soon as the backend returns a result for {active ? 'this module' : 'any module'}.</p>
            : <div className="prov-grid">{evidence.map((e) => <ProvenanceBlock key={e.title} {...e} />)}</div>}
          {(wantAll || active === 'm4') && vessels.data && <p className="hint" style={{ marginTop: 10 }}>M4 · the vessel-candidates endpoint returns no provenance block; the analysis it correlated against is <span className="mono">{vessels.data.analysis_id}</span>.</p>}
        </div>
      </section>
    </>
  )
}
