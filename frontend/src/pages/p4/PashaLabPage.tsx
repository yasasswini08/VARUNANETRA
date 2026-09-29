import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowRight, Check, Circle, Loader2, X } from 'lucide-react'
import { InvestigationMap } from '../../components/investigation/InvestigationMap'
import { Busy, OpError, RunButton, num, utc } from '../../components/investigation/parts'
import { EmptyState, ErrorState, SkeletonRows } from '../../components/StateViews'
import { BackendStatus, KvU, Na, SourceTag } from '../../components/p4/parts'
import { NeedInput, P4Shell } from '../../components/p4/P4Shell'
import { useWorkspace } from '../../hooks/useWorkspace'
import { useElapsed, usePasha } from '../../hooks/usePasha'
import { buildLayers, replayable, vesselKey, vesselLabel } from '../../lib/p4'
import { fmtLat, fmtLon } from '../../lib/format'
import type { StageState } from '../../lib/investigation'

export default function PashaLabPage() {
  const { id = '' } = useParams()
  const [q] = useSearchParams()
  const ws = useWorkspace(id)
  const pasha = usePasha(ws)
  const { drift, vessels, ctx } = ws
  const a = drift.analysis
  const cands = vessels.data?.candidates ?? []
  const preset = q.get('vessel')
  const [picked, setPicked] = useState<Set<string> | null>(null)
  const [focus, setFocus] = useState<string | null>(preset)

  const eligible = cands.flatMap((v, i) => (replayable(v) === null ? [vesselKey(v, i)] : []))
  const chosen = picked ?? new Set(preset && eligible.includes(preset) ? [preset] : eligible)
  const toggle = (k: string) => setPicked((p) => { const n = new Set(p ?? chosen); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const selected = cands.filter((v, i) => chosen.has(vesselKey(v, i)) && replayable(v) === null)

  const running = pasha.op.status === 'running'
  const elapsed = useElapsed(running)
  const failure = pasha.op.status === 'error' ? pasha.op.error : null
  const slick = ctx.slick
  const checks: [string, boolean, string][] = [
    ['Drift analysis available', !!a, a ? a.id.slice(0, 8) : 'run M3 first'],
    ['Observed slick is a Polygon', !!slick?.polygon, slick?.polygon ? (slick.reduced ? 'largest part of a MultiPolygon' : 'ok') : 'no usable detection geometry'],
    ['At least one replayable candidate selected', selected.length > 0, `${selected.length} selected`],
  ]
  const valid = checks.every((c) => c[1])
  const m5: StageState | undefined = running ? 'running' : failure ? 'failed' : undefined
  const result = pasha.result
  const shown = result?.candidates ?? []
  const layers = useMemo(() => buildLayers({
    ctx, analysis: a, candidates: shown.length ? shown : selected, selectedId: focus, showCounterfactual: true,
  }), [ctx, a, shown, selected, focus])
  const focusCand = cands.find((v, i) => vesselKey(v, i) === focus) ?? null

  return (
    <P4Shell ws={ws} title="PASHA Simulation Lab" lead="What would the observed spill look like if this candidate vessel were the source? The replay runs on the backend; nothing is simulated in the browser." m5={m5} runId={pasha.runId}>
      {!a || !vessels.data || cands.length === 0 ? (
        <NeedInput id={id} what={!a ? 'PASHA needs a drift analysis from M3.' : 'PASHA needs scored candidate vessels from M4. Run vessel correlation first.'} to={!a ? 'm3' : 'm4'} />
      ) : (
        <div className="p4-lab">
          <section className="card" aria-label="Hypothesis configuration">
            <div className="card__head"><h2 className="card__title">Hypothesis configuration</h2></div>
            <div className="card__body p4-stack">
              <KvU rows={[['Drift analysis', a.id], ['Release window', `${utc(a.release_start)} → ${utc(a.release_end)}`], ['Observed slick', slick ? `score ${slick.detection.detection_score.toFixed(3)} · ${slick.detection.area_km2.toFixed(1)} km²` : null, 'No detection'], ['Current hypothesis', focusCand ? vesselLabel(focusCand) : `${selected.length} candidate(s) selected`]]} />
              <fieldset className="p4-cands">
                <legend>Candidate hypotheses</legend>
                {cands.map((v, i) => {
                  const k = vesselKey(v, i), why = replayable(v)
                  return (
                    <label key={k} className={`p4-cand${why ? ' is-off' : ''}`} onMouseEnter={() => setFocus(k)}>
                      <input type="checkbox" checked={chosen.has(k) && !why} disabled={!!why || running} onChange={() => toggle(k)} />
                      <span><b>{vesselLabel(v)}</b><small className="mono">M4 {num(v.overall_score, 3)}{v.best_fit_position ? ` · ${fmtLat(v.best_fit_position.lat)} ${fmtLon(v.best_fit_position.lon)}` : ''}{why ? ` · cannot replay: ${why}` : ''}</small></span>
                    </label>
                  )
                })}
              </fieldset>
              <p className="hint">Source position, release time and ensemble are fixed by the backend from each candidate&apos;s best fit; the API accepts no other replay parameters. The outcome is computed over the candidates you submit.</p>

              <ul className="p4-checks" aria-label="Validation">
                {checks.map(([l, ok, d]) => <li key={l} className={ok ? 'ok' : 'bad'}>{ok ? <Check size={14} aria-hidden="true" /> : <X size={14} aria-hidden="true" />}<span>{l}</span><small>{d}</small></li>)}
              </ul>
              <RunButton busy={running} disabled={!valid} why="Resolve the validation items above" onClick={() => void pasha.run(selected)}>Run counterfactual</RunButton>
              <div aria-live="polite">
                {running && <Busy>RUNNING — forward replay, falsification and decision gate execute on the backend. No progress is reported. Elapsed {elapsed}s.</Busy>}
              </div>
              {failure && <OpError error={failure} onRetry={() => void pasha.run(selected)} title="Counterfactual replay failed" />}
              {pasha.op.status === 'success' && <div className="callout callout--ok" role="status"><Check size={15} aria-hidden="true" /><span>Result received · run <span className="mono">{pasha.op.data.run_id.slice(0, 8)}</span></span></div>}
            </div>
          </section>

          <section className="card" aria-label="Simulation map">
            <div className="card__head"><h2 className="card__title">Simulation map</h2></div>
            <div className="card__body">
              <InvestigationMap layers={layers} />
              <ul className="p4-legend" aria-label="Map semantics">
                <li><i className="lg lg--obs" />Observed · detected slick</li><li><i className="lg lg--rec" />Reconstructed · probable origin</li>
                <li><i className="lg lg--cf" />Counterfactual · candidate release position</li><li><i className="lg lg--unc" />Uncertainty · origin ± km</li>
              </ul>
              <p className="hint">Backend did not provide simulated or observed trajectory geometry; only release positions are plotted.</p>
            </div>
          </section>

          <section className="card" aria-label="Result summary">
            <div className="card__head"><h2 className="card__title">Result summary</h2>{result && <SourceTag kind="live" />}</div>
            <div className="card__body p4-stack">
              {pasha.stored.status === 'loading' && pasha.runId && !result && <SkeletonRows rows={3} />}
              {pasha.stored.status === 'error' && !result && <ErrorState compact error={pasha.stored.error} onRetry={pasha.stored.retry} title="Stored PASHA result could not be loaded" />}
              {!result && !running && pasha.stored.status !== 'loading' && pasha.stored.status !== 'error' && <EmptyState title="PASHA result is not available">No run is stored for this drift analysis. Configure a hypothesis and run the counterfactual.</EmptyState>}
              {result && (
                <div className="p4-reveal">
                  <div className="p4-outcome"><span>Backend decision</span><BackendStatus status={result.outcome.status} /></div>
                  <p className="p4-reason">{result.outcome.reason}</p>
                  <KvU rows={[['Run ID', result.run_id], ['Created', utc(pasha.historyRow?.created_at), 'Not in run history'], ['Margin', result.outcome.margin !== null ? result.outcome.margin.toFixed(4) : null, 'Not computed'], ['Leading candidate key', result.outcome.leading_candidate, 'None designated by the backend']]} />
                  <ul className="p4-rlist">
                    {result.candidates.map((c, i) => (
                      <li key={vesselKey(c, i)}>
                        <div><b>{vesselLabel(c)}</b> <BackendStatus status={c.status} /></div>
                        <div className="p4-rlist__m"><span>Physical consistency score <b className="mono">{num(c.falsification?.physical_consistency_score, 4)}</b></span><span>Gate <b>{c.falsification ? (c.falsification.pass_fail ? 'passed' : 'failed') : <Na why="Not computed" />}</b></span></div>
                      </li>
                    ))}
                  </ul>
                  <div className="p4-actions">
                    <Link className="btn btn--sm" to={`/investigations/${id}/pasha/hypotheses?run=${result.run_id}`}>Compare hypotheses <ArrowRight size={13} aria-hidden="true" /></Link>
                    <Link className="btn btn--sm" to={`/investigations/${id}/pasha/replay?run=${result.run_id}`}>Replay detail <ArrowRight size={13} aria-hidden="true" /></Link>
                  </div>
                  <p className="hint">Scores are physical consistency scores, not probabilities of responsibility.</p>
                </div>
              )}
              {pasha.rows.length > 1 && (
                <label className="inline-field">Stored runs<select value={pasha.runId ?? ''} onChange={(e) => pasha.select(e.target.value)}>{pasha.rows.map((r) => <option key={r.run_id} value={r.run_id}>{utc(r.created_at)} · {r.status ?? 'no status'}</option>)}</select></label>
              )}
              {running && <p className="hint"><Loader2 size={13} className="spin" aria-hidden="true" /> Waiting for the backend.</p>}
              {!result && <p className="hint"><Circle size={9} aria-hidden="true" /> Nothing is shown until the backend returns a result.</p>}
            </div>
          </section>
        </div>
      )}
    </P4Shell>
  )
}
