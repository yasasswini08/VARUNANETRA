import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Info, Plus, Search, UploadCloud } from 'lucide-react'
import { HealthBar } from '../components/mission/HealthBar'
import { Metrics } from '../components/mission/Metrics'
import { ProviderList } from '../components/mission/ProviderPanel'
import { ActivityFeed } from '../components/mission/ActivityFeed'
import { RecentInvestigations } from '../components/mission/RecentInvestigations'
import { IncidentMap } from '../components/IncidentMap'
import { ErrorState, SkeletonRows } from '../components/StateViews'
import { useIncidents, useObservations, useProviders, useReports, useScenes } from '../hooks/useMissionData'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { TAGLINE } from '../config/site'

export default function MissionControlPage() {
  useDocumentTitle('Mission Control')
  const incidents = useIncidents()
  const scenes = useScenes()
  const reports = useReports()
  const observations = useObservations()
  const providers = useProviders()
  const [selected, setSelected] = useState<string | null>(null)

  const incList = incidents.data?.incidents ?? []
  const sceneList = scenes.data?.scenes ?? []

  return (
    <>
      <header className="mc-head">
        <div>
          <span className="eyebrow">{TAGLINE}</span>
          <h1 style={{ marginTop: 10 }}>Mission Control</h1>
          <p>Monitor system health, incident records, satellite scenes and data providers.</p>
        </div>
        <Link to="/investigations/new" className="btn btn--primary"><Plus size={16} /> New Investigation</Link>
      </header>

      <div style={{ marginBottom: 16 }}><HealthBar /></div>
      <Metrics incidents={incidents} scenes={scenes} observations={observations} reports={reports} />

      <div className="mc-grid">
        <div className="mc-col">
          <section className="card" aria-label="Operational map">
            <div className="card__head"><h2 className="card__title">Operational picture</h2></div>
            <div className="card__body">
              {incidents.status === 'error' ? (
                <ErrorState error={incidents.error} onRetry={incidents.retry} />
              ) : incidents.status === 'loading' ? (
                <div className="skel" style={{ aspectRatio: '16 / 8.5', minHeight: 260 }} role="status" aria-label="Loading map" />
              ) : (
                <IncidentMap incidents={incList} scenes={sceneList} selectedId={selected} onSelect={setSelected} />
              )}
              {scenes.status === 'error' && incidents.status === 'success' && (
                <div className="note" style={{ marginTop: 10 }}><Info aria-hidden="true" /><span>Scene footprints unavailable: {scenes.error.message}</span></div>
              )}
            </div>
          </section>

          <section className="card" aria-label="Recent investigations">
            <div className="card__head">
              <h2 className="card__title">Recent investigations</h2>
              <Link to="/history" className="link-more">View all <ArrowRight size={13} /></Link>
            </div>
            <div className="card__body">
              {incidents.status === 'loading' && <SkeletonRows rows={4} />}
              {incidents.status === 'error' && <ErrorState error={incidents.error} onRetry={incidents.retry} compact />}
              {incidents.status === 'success' && <RecentInvestigations incidents={incList} selectedId={selected} onSelect={setSelected} />}
            </div>
          </section>
        </div>

        <div className="mc-col">
          <section className="card" aria-label="Satellite data">
            <div className="card__head"><h2 className="card__title">Satellite data</h2></div>
            <div className="card__body sat-links">
              <Link to="/scene-explorer" className="btn"><Search size={15} /> Explore scenes</Link>
              <Link to="/sar-ingestion" className="btn"><UploadCloud size={15} /> Ingest SAR product</Link>
              <p className="hint">Search the Sentinel-1 catalogue or upload a product, then start an investigation from it.</p>
            </div>
          </section>

          <section className="card" aria-label="Data providers">
            <div className="card__head">
              <h2 className="card__title">Data providers</h2>
              <Link to="/data-resources" className="link-more">Details <ArrowRight size={13} /></Link>
            </div>
            <div className="card__body"><ProviderList state={providers} retry={providers.retry} /></div>
          </section>

          <section className="card" aria-label="Recent activity">
            <div className="card__head"><h2 className="card__title">Recent activity</h2></div>
            <div className="card__body">
              {[incidents, scenes, reports, observations].every((s) => s.status === 'error') && incidents.status === 'error' ? (
                <ErrorState error={incidents.error} onRetry={() => { incidents.retry(); scenes.retry(); reports.retry(); observations.retry() }} compact />
              ) : [incidents, scenes, reports, observations].some((s) => s.status === 'loading') ? <SkeletonRows rows={4} height={36} /> : (
                <ActivityFeed incidents={incList} scenes={sceneList} reports={reports.data?.reports ?? []} observations={observations.data?.observations ?? []} />
              )}
              {[scenes, reports, observations].some((s) => s.status === 'error') && (
                <div className="note" style={{ marginTop: 10 }}><Info aria-hidden="true" /><span>Some activity sources are unavailable.</span></div>
              )}
            </div>
          </section>
        </div>
      </div>
    </>
  )
}
