import { useMemo } from 'react'
import { getDriftAnalysis, getIncidentDetail, getObservationsFor, getReportsFor, getScenesFor, listAllPashaRuns, listPashaRuns } from '../api'
import { useApi } from './useApi'
import { useIncidents, useObservations, useReports, useScenes } from './useMissionData'
import { readRefs } from '../lib/refs'
import { ts, type Canon } from '../lib/status'
import type { Incident, PashaHistoryRow, ReportSummary } from '../types/api'

export type RecordStage = 'report' | 'pasha' | 'input' | 'created'
export const STAGE_TEXT: Record<RecordStage, string> = { report: 'Report generated', pasha: 'M5 · PASHA run stored', input: 'SAR input linked', created: 'Incident created' }

export interface HistoryRow {
  inc: Incident
  scenes: number
  observations: number
  reports: ReportSummary[]
  runs: PashaHistoryRow[]
  stage: RecordStage
  report: Canon
}

/**
 * The backend has no investigation table: an investigation is an incident record, and its id is the investigation id.
 * Stage is derived only from artefacts the list endpoints expose (observations, scenes, PASHA runs, reports).
 */
export function useHistoryRows() {
  const incidents = useIncidents(), scenes = useScenes(), observations = useObservations(), reports = useReports()
  const runs = useApi((s) => listAllPashaRuns(s), [])
  const rows = useMemo<HistoryRow[]>(() => (incidents.data?.incidents ?? []).map((inc) => {
    const rp = (reports.data?.reports ?? []).filter((r) => r.incident_id === inc.id)
    const pr = (runs.data?.runs ?? []).filter((r) => r.incident_id === inc.id)
    const sc = (scenes.data?.scenes ?? []).filter((s) => s.incident_id === inc.id).length
    const ob = (observations.data?.observations ?? []).filter((o) => o.incident_id === inc.id).length
    const stage: RecordStage = rp.length ? 'report' : pr.length ? 'pasha' : sc + ob > 0 ? 'input' : 'created'
    return { inc, scenes: sc, observations: ob, reports: rp, runs: pr, stage, report: rp.length ? 'complete' : pr.length ? 'ready' : 'not-executed' }
  }), [incidents.data, scenes.data, observations.data, reports.data, runs.data])
  return { incidents, scenes, observations, reports, runs, rows }
}

export interface RecordStageRow { code: string; title: string; state: Canon; note: string }

/** One past investigation, read from stored artefacts only. Nothing is executed. */
export function useHistoryRecord(id: string) {
  const incidents = useIncidents()
  const detail = useApi((s) => getIncidentDetail(id, s), [id])
  const obs = useApi((s) => getObservationsFor(id, s), [id])
  const scenes = useApi((s) => getScenesFor(id, s), [id])
  const reports = useApi((s) => getReportsFor(id, s), [id])
  const runs = useApi((s) => listPashaRuns(id, s), [id])
  const refs = useMemo(() => readRefs(id), [id])
  const analysisId = runs.data?.runs[0]?.analysis_id ?? refs.analysisId ?? null
  const analysis = useApi((s) => (analysisId ? getDriftAnalysis(analysisId, s) : Promise.resolve(null)), [analysisId])

  const created = incidents.data?.incidents.find((i) => i.id === id)?.created_at ?? null
  const dets = detail.data?.detections ?? []
  const rp = reports.data?.reports ?? []
  const pr = runs.data?.runs ?? []
  const a = analysis.data
  const hasWindCur = !!(a?.provenance.wind || a?.provenance.current || refs.wind || refs.currents)
  const hasVessels = !!refs.vessels || pr.length > 0
  const usable = (obs.data?.observations ?? []).some((o) => o.status === 'ready')
  const none = 'No stored artefact found'

  const stages: RecordStageRow[] = [
    { code: 'M1', title: 'SAR detection', state: dets.length ? 'complete' : 'not-executed', note: dets.length ? `${dets.length} persisted detection(s)` : usable ? 'SAR input linked; no persisted detection' : none },
    { code: 'M2', title: 'Environmental context', state: hasWindCur ? 'complete' : 'not-executed', note: hasWindCur ? (a?.provenance.wind || a?.provenance.current ? 'Forcing provenance stored with the drift analysis' : 'Summary cached in this browser') : none },
    { code: 'M3', title: 'Drift reconstruction', state: a ? 'complete' : analysis.status === 'error' ? 'unavailable' : 'not-executed', note: a ? `Analysis ${a.id.slice(0, 8)} · ±${a.uncertainty_km} km` : analysis.status === 'error' ? analysis.error.message : none },
    { code: 'M4', title: 'Vessel correlation', state: hasVessels ? 'complete' : 'not-executed', note: hasVessels ? (pr.length ? 'Candidates were replayed in a stored PASHA run' : 'Candidates cached in this browser') : none },
    { code: 'M5', title: 'PASHA counterfactual', state: pr.length ? 'complete' : 'not-executed', note: pr.length ? `${pr.length} stored run(s) · latest ${pr[0].status ?? 'no status'}` : none },
    { code: 'M6', title: 'Report', state: rp.length ? 'complete' : 'not-executed', note: rp.length ? `${rp.length} generated report(s)` : none },
  ]
  const updated = [...rp.map((r) => r.generated_at), ...pr.map((r) => r.created_at)].sort((x, y) => ts(y) - ts(x))[0] ?? null
  return { incidents, detail, obs, scenes, reports, runs, analysis, refs, created, updated, stages, dets, rp, pr }
}
