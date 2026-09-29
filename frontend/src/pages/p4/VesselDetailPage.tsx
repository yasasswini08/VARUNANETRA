import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { InvestigationMap } from '../../components/investigation/InvestigationMap'
import { utc } from '../../components/investigation/parts'
import { EmptyState } from '../../components/StateViews'
import { BackendStatus, KvU, Meter, Na, ProvPanel, SourceTag } from '../../components/p4/parts'
import { NeedInput, P4Shell } from '../../components/p4/P4Shell'
import { useWorkspace } from '../../hooks/useWorkspace'
import { buildLayers, haversineKm, releaseTime, txt, vesselKey, vesselLabel } from '../../lib/p4'
import { fmtLat, fmtLon } from '../../lib/format'

const Sec = ({ n, title, src, children }: { n: number; title: string; src?: 'live' | 'derived' | 'unavailable'; children: React.ReactNode }) => (
  <section className="card p4-sec"><div className="card__head"><h2 className="card__title"><span className="p4-n">{n}</span>{title}</h2>{src && <SourceTag kind={src} />}</div><div className="card__body">{children}</div></section>
)

export default function VesselDetailPage() {
  const { id = '', vesselId = '' } = useParams()
  const ws = useWorkspace(id)
  const { drift, vessels, ctx, providers } = ws
  const key = decodeURIComponent(vesselId)
  const list = vessels.data?.candidates ?? []
  const idx = list.findIndex((v, i) => vesselKey(v, i) === key)
  const v = idx >= 0 ? list[idx] : null
  const a = drift.analysis
  const layers = useMemo(() => buildLayers({ ctx, analysis: a, candidates: v ? [v] : [], selectedId: key }), [ctx, a, v, key])
  const run = (ws.history.data?.runs ?? []).find((r) => r.analysis_id === a?.id)
  const aisCfg = providers.data?.providers.find((p) => p.name === 'ais_global_fishing_watch')?.configured

  if (!v) {
    return (
      <P4Shell ws={ws} title="Vessel Investigation" lead="Why is this vessel being considered?">
        {vessels.data
          ? <div className="card"><div className="card__body"><EmptyState title="Candidate not found" action={<Link className="btn btn--sm" to={`/investigations/${id}/vessels`}>Back to candidates</Link>}>No candidate with key <span className="mono">{key}</span> is in the stored M4 result. Re-run correlation if the AIS window has changed.</EmptyState></div></div>
          : <NeedInput id={id} what="No M4 vessel result is available for this investigation in this browser. Run vessel correlation first." />}
      </P4Shell>
    )
  }

  const origin = a?.probable_origin_centroid ?? null
  const km = origin && v.best_fit_position ? haversineKm(origin, v.best_fit_position) : null
  const rel = releaseTime(ctx.observationTime, v.best_fit_hour)

  return (
    <P4Shell ws={ws} title={vesselLabel(v)} lead="Candidate vessel · why it is being considered. This is correlation evidence, not a finding that this vessel caused the spill.">
      <div className="p4-split p4-split--detail">
        <div className="p4-stack">
          <Sec n={1} title="Vessel identity" src="live">
            <KvU rows={[['Name', txt(v.name)], ['MMSI', txt(v.mmsi)], ['IMO', txt(v.imo)], ['Vessel type', txt(v.vessel_type)], ['Candidate key', v.vessel_key ?? null], ['M4 status', v.status ?? null, 'Not returned by M4']]} />
          </Sec>
          <Sec n={2} title="Correlation summary" src="live">
            <Meter label="Correlation score (overall)" value={v.overall_score} hint="Backend M4 result; combines the factors below." />
            <Meter label="Spatial fit" value={v.spatial_score} />
            <Meter label="Temporal fit" value={v.temporal_score} />
            <Meter label="Drift compatibility" value={v.trajectory_score} />
            <Meter label="AIS behaviour (supporting only)" value={v.behavioural_score} />
          </Sec>
          <Sec n={3} title="Spatial relationship" src="live">
            <KvU rows={[
              ['Best-fit position', v.best_fit_position ? `${fmtLat(v.best_fit_position.lat)} ${fmtLon(v.best_fit_position.lon)}` : null, 'Backend returned no position'],
              ['Reconstructed origin', origin ? `${fmtLat(origin.lat)} ${fmtLon(origin.lon)}` : null, 'No origin centroid in the drift analysis'],
              ['Origin uncertainty', a ? `± ${a.uncertainty_km} km` : null],
              ['Spatial score', v.spatial_score?.toFixed(4) ?? null, 'Not returned'],
            ]} />
            <p className="hint">Separation from origin: {km !== null ? <><b className="mono">{km.toFixed(1)} km</b> <SourceTag kind="derived" /> great-circle between the two positions above.</> : <Na why="needs both a best-fit position and an origin centroid" />}</p>
          </Sec>
          <Sec n={4} title="Temporal relationship" src="live">
            <KvU rows={[
              ['Best-fit hour before observation', v.best_fit_hour !== null && v.best_fit_hour !== undefined ? `${v.best_fit_hour.toFixed(2)} h` : null],
              ['Scene acquired', utc(ctx.observationTime)],
              ['Implied release time', rel ? `${utc(rel.toISOString())}` : null, 'needs scene time and best-fit hour'],
              ['Release window (drift analysis)', a ? `${utc(a.release_start)} → ${utc(a.release_end)}` : null],
              ['Temporal score', v.temporal_score?.toFixed(4) ?? null, 'Not returned'],
            ]} />
            {rel && <p className="hint">Implied release time is <SourceTag kind="derived" /> scene time minus best-fit hour.</p>}
          </Sec>
          <Sec n={5} title="Drift relationship" src="live">
            <KvU rows={[['Drift compatibility score', v.trajectory_score?.toFixed(4) ?? null, 'Not returned'], ['Drift analysis', a?.id ?? null], ['Ensemble size', a?.ensemble_size ?? null], ['Model version', a?.model_version ?? null]]} />
          </Sec>
          <Sec n={6} title="AIS evidence" src="live">
            <KvU rows={[
              ['AIS behaviour score', v.behavioural_score?.toFixed(4) ?? null, 'Not returned'],
              ['AIS provider', aisCfg === undefined ? null : aisCfg ? 'Global Fishing Watch · configured' : 'Global Fishing Watch · not configured'],
              ['Track geometry', null, 'Not returned by the vessel-candidates endpoint'],
              ['Speed / heading / flag / owner', null, 'Not returned; not shown'],
            ]} />
          </Sec>
          <Sec n={7} title="Investigation context" src="live">
            <KvU rows={[['Investigation', ws.incident?.name ?? null], ['Investigation ID', id], ['Detections', ctx.detections.length ? `${ctx.detections.length} persisted` : null, 'None persisted'], ['Top detection score', ctx.slick ? ctx.slick.detection.detection_score.toFixed(3) : null]]} />
          </Sec>
          <Sec n={8} title="Provenance">
            <KvU rows={[['Candidate record', v.db_id ?? null, 'Not persisted (no MMSI or no database)'], ['M4 provenance block', null, 'Not returned by the endpoint']]} />
            <ProvPanel title="Drift forcing behind this correlation" items={[{ title: 'M3 · wind', p: a?.provenance.wind }, { title: 'M3 · currents', p: a?.provenance.current }]} />
          </Sec>
        </div>

        <aside className="p4-stick p4-stack" aria-label="Vessel map and next step">
          <section className="card"><div className="card__head"><h2 className="card__title">Position vs. origin</h2></div><div className="card__body"><InvestigationMap layers={layers} /></div></section>
          <section className="card p4-sec"><div className="card__head"><h2 className="card__title"><span className="p4-n">9</span>PASHA</h2></div><div className="card__body p4-stack">
            <p className="hint">Test whether releasing at this vessel&apos;s best-fit position and time reproduces the observed slick.</p>
            {run ? <p className="hint">Latest stored run: <BackendStatus status={run.status} /></p> : <p className="hint">No PASHA run stored for this drift analysis.</p>}
            <Link className="btn btn--primary" to={`/investigations/${id}/pasha?vessel=${encodeURIComponent(key)}`}>Open in PASHA Lab <ArrowRight size={15} aria-hidden="true" /></Link>
            <Link className="btn btn--sm" to={`/investigations/${id}/vessels`}>Back to candidates</Link>
          </div></section>
        </aside>
      </div>
    </P4Shell>
  )
}
