import { Info } from 'lucide-react'
import type { useEnvironment } from '../../hooks/useInvestigation'
import type { OpState } from '../../hooks/useOperation'
import type { StageInfo } from '../../lib/investigation'
import type { EnvironmentSummary } from '../../types/api'
import { Busy, Kv, LockedNote, OpError, RunButton, Section, utc } from './parts'

function Source({ label, state, data, retry }: { label: string; state: OpState<EnvironmentSummary>; data: EnvironmentSummary | null; retry: () => void }) {
  return (
    <div className="src-card">
      <h4>{label}</h4>
      {state.status === 'running' && <Busy>Retrieving from provider…</Busy>}
      {state.status === 'error' && <OpError error={state.error} onRetry={retry} title={`${label} retrieval failed`} />}
      {state.status !== 'running' && state.status !== 'error' && !data && <p className="hint">Not retrieved.</p>}
      {data && state.status !== 'running' && (
        <Kv rows={[
          ['Source', data.provenance.source], ['Dataset', data.provenance.dataset], ['Variables', data.variables.join(', ')],
          ['Time steps', data.time_steps], ['Array shapes', Object.entries(data.shape).map(([k, v]) => `${k}: ${v.join('×')}`).join('; ')],
          ['Retrieved', utc(data.provenance.retrieved_at)], ['State', state.status === 'success' ? 'Fresh from backend' : 'Browser-cached from an earlier retrieval'],
        ]} />
      )}
    </div>
  )
}

export function M2Panel({ env, stage, setAgeMax }: { env: ReturnType<typeof useEnvironment>; stage: StageInfo; setAgeMax: (h: number) => void }) {
  const busy = env.wind.status === 'running' || env.currents.status === 'running'
  const r = env.request
  return (
    <div className="mod">
      <Section title="Input · request window">
        {r ? (
          <Kv rows={[['Extent (lon, lat)', `${r.minlon.toFixed(3)}, ${r.minlat.toFixed(3)} → ${r.maxlon.toFixed(3)}, ${r.maxlat.toFixed(3)}`], ['From', utc(r.start)], ['To (observation)', utc(r.end)]]} />
        ) : <LockedNote>{stage.state === 'locked' ? stage.note : 'The observation time or slick extent is missing.'}</LockedNote>}
        <label className="inline-field">Maximum slick age (hours)
          <input type="number" min={1} max={168} step={1} value={env.ageMax} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= 1) setAgeMax(v) }} />
        </label>
        <p className="hint">The window reaches back to the observation time minus this age minus 6 h, the same hindcast window the backend uses for drift.</p>
      </Section>

      <Section title="Environmental context" aside={<RunButton busy={busy} disabled={!r || stage.state === 'unavailable'} why={stage.note} onClick={() => void env.run()}>{env.windData || env.currentsData ? 'Refresh' : 'Retrieve context'}</RunButton>}>
        {stage.state === 'unavailable' && <LockedNote>{stage.note}</LockedNote>}
        {busy && <Busy>PROCESSING — provider retrieval can take minutes (the Copernicus queue is not controlled by Varuna). No progress is reported.</Busy>}
        <div className="src-grid">
          <Source label="Wind · ERA5" state={env.wind} data={env.windData} retry={() => void env.run()} />
          <Source label="Currents · CMEMS" state={env.currents} data={env.currentsData} retry={() => void env.run()} />
        </div>
        <div className="note"><Info aria-hidden="true" /><span>The backend returns variable names, array shapes and provenance only — no gridded values — so the map shows the requested extent, not a wind or current field.</span></div>
      </Section>
    </div>
  )
}
