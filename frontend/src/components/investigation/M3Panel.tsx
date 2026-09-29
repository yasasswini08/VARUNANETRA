import { useState } from 'react'
import { Info } from 'lucide-react'
import { ErrorState, SkeletonRows } from '../StateViews'
import type { InvestigationCtx, useDrift } from '../../hooks/useInvestigation'
import type { StageInfo } from '../../lib/investigation'
import { formatDateTime } from '../../lib/format'
import { Busy, Kv, LockedNote, num, OpError, RunButton, Section, utc } from './parts'

const HOURS = [12, 24, 48, 72]

function Timeline({ items }: { items: { label: string; time: string | null; note?: string }[] }) {
  return (
    <ol className="timeline" aria-label="Drift timeline">
      {items.filter((i) => i.time).map((i) => (
        <li key={i.label}><span className="timeline__dot" aria-hidden="true" /><strong>{i.label}</strong><time className="mono">{formatDateTime(i.time as string)} UTC</time>{i.note && <small>{i.note}</small>}</li>
      ))}
    </ol>
  )
}

export function M3Panel({ ctx, drift, stage }: { ctx: InvestigationCtx; drift: ReturnType<typeof useDrift>; stage: StageInfo }) {
  const [min, setMin] = useState(String(drift.ageMin)), [max, setMax] = useState(String(drift.ageMax)), [ens, setEns] = useState('')
  const [hours, setHours] = useState<number[]>([24, 48, 72])
  const a = drift.analysis
  const minN = Number(min), maxN = Number(max), ensN = ens === '' ? undefined : Number(ens)
  const valid = Number.isFinite(minN) && Number.isFinite(maxN) && minN >= 0 && maxN > minN && (ensN === undefined || (Number.isInteger(ensN) && ensN > 0))
  const running = drift.backward.status === 'running'
  const blocked = stage.state === 'locked' || stage.state === 'unavailable'
  const fc = drift.forecastData
  const fcKeys = fc ? Object.keys(fc.forecasts) : []

  return (
    <div className="mod">
      <Section title="Input · backward reconstruction">
        {ctx.slick ? (
          <Kv rows={[['Slick (detection)', ctx.slick.detection.id], ['Area', `${num(ctx.slick.detection.area_km2)} km²`], ['Observation time', utc(ctx.observationTime)]]} />
        ) : <LockedNote>{stage.note}</LockedNote>}
        <div className="form-row">
          <label>Min age (h)<input type="number" min={0} value={min} onChange={(e) => setMin(e.target.value)} /></label>
          <label>Max age (h)<input type="number" min={1} value={max} onChange={(e) => setMax(e.target.value)} /></label>
          <label>Ensemble size<input type="number" min={1} placeholder="backend default" value={ens} onChange={(e) => setEns(e.target.value)} /></label>
        </div>
        {!valid && <p className="hint" role="alert">Max age must exceed min age; ensemble size must be a positive whole number.</p>}
        <RunButton busy={running} disabled={blocked || !valid} why={stage.note} onClick={() => void drift.start(minN, maxN, ensN)}>{a ? 'Re-run backward drift' : 'Run backward drift'}</RunButton>
        {stage.state === 'unavailable' && <LockedNote>{stage.note}</LockedNote>}
        {running && <Busy>PROCESSING — the backend fetches ERA5 and CMEMS forcing and runs the OpenDrift ensemble. No progress is reported.</Busy>}
        {drift.backward.status === 'error' && <OpError error={drift.backward.error} onRetry={() => void drift.start(minN, maxN, ensN)} title="Drift reconstruction failed" />}
      </Section>

      <Section title="Reconstruction output">
        {drift.stored.status === 'loading' && !a && <SkeletonRows rows={4} height={28} />}
        {drift.stored.status === 'error' && !a && (
          <div><ErrorState compact error={drift.stored.error} onRetry={drift.stored.retry} title="Stored analysis could not be read" />
            <p className="hint" style={{ textAlign: 'center' }}><button className="btn btn--sm" onClick={drift.forget}>Forget stored analysis id</button></p></div>
        )}
        {!a && drift.stored.status !== 'loading' && drift.stored.status !== 'error' && !running && <p className="hint">{blocked ? 'Not available until M1 has produced a slick.' : 'READY — no drift analysis has been run.'}</p>}
        {a && (
          <>
            <Kv rows={[
              ['Analysis ID', a.id], ['Model', a.model_version], ['Ensemble members', a.ensemble_size], ['Origin uncertainty', `${num(a.uncertainty_km)} km`],
              ['Origin centroid', a.probable_origin_centroid ? `${a.probable_origin_centroid.lat.toFixed(4)}, ${a.probable_origin_centroid.lon.toFixed(4)}` : 'not returned'],
              ['Origin region', a.probable_origin_geometry ? a.probable_origin_geometry.type : 'No highest-density region returned'],
              ['Release start', utc(a.release_start)], ['Release end', utc(a.release_end)], ['Observation', utc(a.observation_time)],
            ]} />
            <Timeline items={[
              { label: 't0 · release window opens', time: a.release_start }, { label: 't1 · release window closes', time: a.release_end },
              { label: 't2 · SAR observation', time: a.observation_time ?? null, note: a.observation_time ? undefined : 'Not returned by this endpoint response' },
            ]} />
          </>
        )}
        <div className="note"><Info aria-hidden="true" /><span>The API exposes the origin region, centroid and uncertainty — not individual ensemble trajectories — so none are drawn.</span></div>
      </Section>

      <Section title="Forward forecast">
        {!a ? <LockedNote>Needs a completed drift analysis.</LockedNote> : (
          <>
            <fieldset className="chips" aria-label="Forecast hours">
              <legend className="sr-only">Forecast hours</legend>
              {HOURS.map((h) => (
                <label key={h} className={`chip${hours.includes(h) ? ' is-on' : ''}`}>
                  <input type="checkbox" className="sr-only" checked={hours.includes(h)} onChange={() => setHours((c) => (c.includes(h) ? c.filter((x) => x !== h) : [...c, h].sort((x, y) => x - y)))} />+{h} h
                </label>
              ))}
            </fieldset>
            <RunButton busy={drift.forecastOp.status === 'running'} disabled={hours.length === 0} why="Select at least one horizon" onClick={() => void drift.forecast(hours)}>{fc ? 'Re-run forecast' : 'Run forecast'}</RunButton>
            {drift.forecastOp.status === 'running' && <Busy>PROCESSING — fresh ERA5/CMEMS forcing is fetched and a forward ensemble is run.</Busy>}
            {drift.forecastOp.status === 'error' && <OpError error={drift.forecastOp.error} onRetry={() => void drift.forecast(hours)} title="Forecast failed" />}
            {fc && drift.forecastOp.status !== 'error' && (
              <>
                <p className="hint">Seeded from: {fc.seeded_from.replace(/_/g, ' ')}{drift.forecastOp.status !== 'success' && ' · browser-cached'}</p>
                <div className="table-wrap"><table className="tbl">
                  <caption className="sr-only">Forecast footprints</caption>
                  <thead><tr><th>Horizon</th><th>Centroid (lat, lon)</th><th>Spread km</th><th>Footprint</th></tr></thead>
                  <tbody>{fcKeys.map((k) => { const f = fc.forecasts[k]; return <tr key={k}><td className="mono">{k}</td><td className="mono">{f.centroid.lat.toFixed(4)}, {f.centroid.lon.toFixed(4)}</td><td className="mono">{num(f.spread_km)}</td><td>{f.geometry.type}</td></tr> })}</tbody>
                </table></div>
              </>
            )}
          </>
        )}
      </Section>
    </div>
  )
}
