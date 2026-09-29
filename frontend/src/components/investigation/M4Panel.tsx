import { useState } from 'react'
import { Info } from 'lucide-react'
import type { useVessels } from '../../hooks/useInvestigation'
import type { StageInfo } from '../../lib/investigation'
import { Busy, LockedNote, num, OpError, RunButton, Section } from './parts'

export function M4Panel({ vessels, stage }: { vessels: ReturnType<typeof useVessels>; stage: StageInfo }) {
  const [dist, setDist] = useState('120')
  const d = Number(dist)
  const valid = Number.isFinite(d) && d > 0
  const running = vessels.op.status === 'running'
  const err = vessels.op.status === 'error' ? vessels.op.error : null
  const noAis = err?.status === 404
  const list = [...(vessels.data?.candidates ?? [])].sort((a, b) => (b.overall_score ?? 0) - (a.overall_score ?? 0))

  return (
    <div className="mod">
      <Section title="Input · correlation window">
        {stage.state === 'locked' ? <LockedNote>{stage.note}</LockedNote> : (
          <>
            <label className="inline-field">Maximum distance from probable origin (km)
              <input type="number" min={1} value={dist} onChange={(e) => setDist(e.target.value)} />
            </label>
            <p className="hint">The backend retrieves AIS tracks around the probable origin, filters them to the release window and this distance, then scores each vessel against the drift ensemble.</p>
          </>
        )}
        {stage.state === 'unavailable' && <LockedNote>{stage.note}</LockedNote>}
        <RunButton busy={running} disabled={stage.state === 'locked' || stage.state === 'unavailable' || !valid} why={stage.note} onClick={() => void vessels.run(d)}>{vessels.data ? 'Re-run correlation' : 'Correlate vessels'}</RunButton>
        {running && <Busy>PROCESSING — AIS retrieval and scoring run on the backend. No progress is reported.</Busy>}
        {err && (noAis
          ? <div className="callout callout--warn" role="alert"><Info size={15} aria-hidden="true" /><span>{err.message}. No vessels are shown because none were returned — nothing is inferred.</span></div>
          : <OpError error={err} onRetry={() => void vessels.run(d)} title="Vessel correlation failed" />)}
      </Section>

      <Section title="Candidate vessels">
        {!vessels.data && !err && !running && <p className="hint">{stage.state === 'locked' ? 'Not available until M3 has produced a drift analysis.' : 'READY — vessels have not been correlated yet.'}</p>}
        {vessels.data && list.length === 0 && <p className="hint">The backend returned zero candidate vessels.</p>}
        {list.length > 0 && (
          <div className="table-wrap"><table className="tbl">
            <caption className="sr-only">Scored candidate vessels</caption>
            <thead><tr><th>Vessel</th><th>MMSI</th><th>IMO</th><th>Type</th><th>Best-fit hour</th><th>Spatial</th><th>Temporal</th><th>Trajectory</th><th>Behaviour</th><th>Overall</th><th>Status</th></tr></thead>
            <tbody>{list.map((v, i) => (
              <tr key={v.vessel_key ?? v.mmsi ?? i}>
                <td>{v.name ?? '—'}</td><td className="mono">{v.mmsi ?? '—'}</td><td className="mono">{v.imo ?? '—'}</td><td>{v.vessel_type ?? '—'}</td>
                <td className="mono">{v.best_fit_hour ?? '—'}</td><td className="mono">{num(v.spatial_score, 3)}</td><td className="mono">{num(v.temporal_score, 3)}</td>
                <td className="mono">{num(v.trajectory_score, 3)}</td><td className="mono">{num(v.behavioural_score, 3)}</td><td className="mono"><strong>{num(v.overall_score, 3)}</strong></td><td>{v.status ?? '—'}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        <div className="note"><Info aria-hidden="true" /><span>Scores show correlation with the reconstructed drift, not attribution. Track geometry and a provenance block are not returned by this endpoint; the map plots each vessel's best-fit position only. Open vessel intelligence for per-vessel detail and PASHA.</span></div>
      </Section>
    </div>
  )
}
