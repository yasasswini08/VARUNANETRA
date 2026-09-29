import type { Workspace } from '../hooks/useWorkspace'
import type { Canon } from './status'
import { ts } from './status'
import type {
  DetectionCandidate, PashaHistoryRow, PashaRunResult, ProvenanceDump, ReportGenerateBody, ReportSummary,
} from '../types/api'

/** Evidence categories in investigation order. The backend returns no evidence graph, so order = pipeline stage order. */
export type EvidenceKind = 'observation' | 'detection' | 'environment' | 'drift' | 'vessels' | 'pasha' | 'report'

export const KIND_META: Record<EvidenceKind, { stage: string; title: string; missing: string }> = {
  observation: { stage: 'Input', title: 'SAR observation', missing: 'No SAR observation or scene is linked to this investigation.' },
  detection: { stage: 'M1', title: 'Detection & slick characterisation', missing: 'M1 detection has not been run.' },
  environment: { stage: 'M2', title: 'Environmental context', missing: 'Wind and current summaries have not been retrieved in this browser.' },
  drift: { stage: 'M3', title: 'Drift reconstruction', missing: 'No drift analysis is recorded for this investigation.' },
  vessels: { stage: 'M4', title: 'Vessel correlation', missing: 'Vessel candidates have not been correlated in this browser.' },
  pasha: { stage: 'M5', title: 'PASHA counterfactual', missing: 'No PASHA run is stored for this drift analysis.' },
  report: { stage: 'M6', title: 'Report artifact', missing: 'No report has been generated for this investigation.' },
}
export const KIND_ORDER: EvidenceKind[] = ['observation', 'detection', 'environment', 'drift', 'vessels', 'pasha', 'report']

export interface EvidenceItem {
  kind: EvidenceKind
  summary: string
  /** 'backend' = re-read from the API now; 'browser-cached' = summary remembered in this browser from an earlier backend response. */
  origin: 'backend' | 'browser-cached'
  timestamp: string | null
  ids: [string, string][]
  provenance: { title: string; p: ProvenanceDump }[]
  /** Only values the backend itself returned as uncertainty or scoring. Nothing is re-labelled as "confidence". */
  metrics: [string, string][]
  raw: unknown
}

export interface EvidenceEntry { kind: EvidenceKind; item: EvidenceItem | null; state: Canon; reason: string | null }

const best = (c: DetectionCandidate[]) => c.filter((x) => typeof x.detection_score === 'number').sort((a, b) => (b.detection_score ?? 0) - (a.detection_score ?? 0))[0]
const latest = (xs: (string | null | undefined)[]) => xs.filter((x): x is string => !!x).sort((a, b) => ts(b) - ts(a))[0] ?? null

export function buildEvidence(ws: Workspace, pasha: { result: PashaRunResult | null; historyRow: PashaHistoryRow | null; runId: string | null }, reports: ReportSummary[]): EvidenceEntry[] {
  const { ctx, detection, env, drift, vessels } = ws
  const out: Partial<Record<EvidenceKind, EvidenceItem>> = {}

  const obs = ctx.input ?? ctx.observations.data?.observations[0] ?? null
  const scenes = ctx.scenes.data?.scenes ?? []
  if (obs || scenes.length) {
    const t = obs?.acquisition_time ?? scenes[0]?.acquisition_time ?? null
    out.observation = {
      kind: 'observation', origin: 'backend', timestamp: t,
      summary: `${obs?.product_id ?? scenes[0]?.product_id ?? 'Scene'} · ${scenes.length} persisted scene(s)`,
      ids: [['Observation ID', obs?.id ?? ''], ['Scene ID', scenes[0]?.id ?? ''], ['Product ID', obs?.product_id ?? scenes[0]?.product_id ?? '']].filter(([, v]) => v) as [string, string][],
      provenance: [], metrics: [], raw: { observation: obs, scenes },
    }
  }

  const dres = detection.result
  if (dres || ctx.detections.length) {
    const top = dres ? best(dres.candidates) : undefined
    const persisted = ctx.detections.length ? ctx.detections.reduce((a, b) => (b.detection_score > a.detection_score ? b : a)) : undefined
    const score = top?.detection_score ?? persisted?.detection_score
    out.detection = {
      kind: 'detection', origin: 'backend', timestamp: dres?.provenance.retrieved_at ?? null,
      summary: dres ? `${dres.diagnostics.accepted_count ?? dres.candidates.length} accepted candidate(s) from ${dres.diagnostics.raw_component_count ?? '—'} raw component(s)` : `${ctx.detections.length} persisted detection(s)`,
      ids: [['Detection run', dres?.detection_id ?? ''], ['Scene ID', dres?.scene_id ?? ''], ['Product ID', dres?.product_id ?? '']].filter(([, v]) => v) as [string, string][],
      provenance: dres ? [{ title: 'M1 · detection', p: dres.provenance }] : [],
      metrics: score !== undefined ? [['Detection score (backend)', score.toFixed(3)]] : [],
      raw: dres ?? ctx.detections,
    }
  }

  const wind = env.windData, cur = env.currentsData
  if (wind || cur) {
    const windCached = !!wind && env.wind.status !== 'success', curCached = !!cur && env.currents.status !== 'success'
    out.environment = {
      kind: 'environment', origin: windCached || curCached ? 'browser-cached' : 'backend',
      timestamp: latest([wind?.provenance.retrieved_at, cur?.provenance.retrieved_at]),
      summary: [wind && 'ERA5 wind', cur && 'CMEMS currents'].filter(Boolean).join(' + ') + ' summary',
      ids: [], metrics: [],
      provenance: [...(wind ? [{ title: 'M2 · wind', p: wind.provenance }] : []), ...(cur ? [{ title: 'M2 · currents', p: cur.provenance }] : [])],
      raw: { wind, currents: cur },
    }
  }

  const a = drift.analysis
  if (a) {
    out.drift = {
      kind: 'drift', origin: 'backend', timestamp: null,
      summary: `Origin uncertainty ±${a.uncertainty_km} km · ensemble ${a.ensemble_size} · ${a.model_version}`,
      ids: [['Analysis ID', a.id], ['Incident ID', a.incident_id]],
      provenance: [...(a.provenance.wind ? [{ title: 'M3 · wind forcing', p: a.provenance.wind }] : []), ...(a.provenance.current ? [{ title: 'M3 · current forcing', p: a.provenance.current }] : [])],
      metrics: [['Origin uncertainty (backend)', `± ${a.uncertainty_km} km`], ['Ensemble size', String(a.ensemble_size)]],
      // density_field_path is a server filesystem path; it is deliberately omitted from anything displayed.
      raw: { ...a, density_field_path: undefined },
    }
  }

  const v = vessels.data
  if (v) {
    out.vessels = {
      kind: 'vessels', origin: vessels.op.status === 'success' ? 'backend' : 'browser-cached', timestamp: null,
      summary: `${v.candidate_count} candidate vessel(s) scored against analysis ${v.analysis_id.slice(0, 8)}`,
      ids: [['Analysis ID', v.analysis_id]], provenance: [], metrics: [], raw: v,
    }
  }

  const pr = pasha.result
  if (pr) {
    out.pasha = {
      kind: 'pasha', origin: 'backend', timestamp: pasha.historyRow?.created_at ?? null,
      summary: `Backend decision ${pr.outcome.status} over ${pr.candidates.length} replayed candidate(s)`,
      ids: [['Run ID', pr.run_id], ['Analysis ID', pr.analysis_id]], provenance: [],
      metrics: pr.outcome.margin !== null ? [['Decision margin (backend)', pr.outcome.margin.toFixed(4)]] : [],
      raw: pr,
    }
  }

  if (reports.length) {
    out.report = {
      kind: 'report', origin: 'backend', timestamp: latest(reports.map((r) => r.generated_at)),
      summary: `${reports.length} generated report(s); latest decision status ${reports[0].decision_status ?? 'not recorded'}`,
      ids: reports.map((r, i) => [`Report ${i + 1}`, r.id] as [string, string]), provenance: [], metrics: [], raw: reports,
    }
  }

  const stageNote = (k: 'm1' | 'm2' | 'm3' | 'm4') => ws.stages.find((s) => s.key === k)
  return KIND_ORDER.map((kind): EvidenceEntry => {
    const item = out[kind] ?? null
    if (item) return { kind, item, state: 'complete', reason: null }
    const st = kind === 'detection' ? stageNote('m1') : kind === 'environment' ? stageNote('m2') : kind === 'drift' ? stageNote('m3') : kind === 'vessels' ? stageNote('m4') : null
    const failed = st?.state === 'failed', unavailable = st?.state === 'unavailable'
    return { kind, item: null, state: failed ? 'failed' : unavailable ? 'unavailable' : 'not-executed', reason: st && (failed || unavailable) ? st.note : KIND_META[kind].missing }
  })
}

/** Real values only; keys with no value are dropped rather than sent as placeholders. */
const compact = (o: Record<string, unknown>): Record<string, unknown> => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== ''))

export function reportMetadata(ws: Workspace, runId: string): ReportGenerateBody {
  const { ctx, detection } = ws
  const o = ctx.input
  const dres = detection.result
  const top = dres ? best(dres.candidates) : undefined
  const sel = ctx.slick?.detection
  return {
    pasha_run_id: runId,
    observed_slick_geometry: (ctx.slick?.polygon ?? {}) as unknown as Record<string, unknown>,
    sentinel1_scene: compact({
      product_id: o?.product_id, acquisition_time: o?.acquisition_time, polarization: o?.polarization, sensor: o?.sensor,
      product_type: o?.product_type, observation_id: o?.id, scene_id: dres?.scene_id ?? ctx.scenes.data?.scenes[0]?.id,
    }),
    spill_detection: compact({
      detection_id: dres?.detection_id, accepted_candidates: dres?.diagnostics.accepted_count,
      detection_score: top?.detection_score ?? sel?.detection_score, area_km2: top?.area_km2 ?? sel?.area_km2,
      classification_label: top?.classification_label ?? sel?.classification_label, model_version: dres?.provenance.model_version,
    }),
  }
}
