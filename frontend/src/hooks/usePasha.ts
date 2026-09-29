import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getPashaRun, runPasha } from '../api'
import { useApi } from './useApi'
import { useOperation } from './useOperation'
import type { Workspace } from './useWorkspace'
import type { PashaRunResult, VesselCandidate } from '../types/api'

/**
 * M5. The backend run is synchronous (POST /pasha/run returns the finished result), so `running` is indeterminate.
 * The selected run lives in ?run= so a browser refresh keeps it; the latest run for this analysis is the default.
 */
export function usePasha(ws: Workspace) {
  const [params, setParams] = useSearchParams()
  const analysisId = ws.drift.analysis?.id
  const rows = (ws.history.data?.runs ?? []).filter((r) => r.analysis_id === analysisId)
  const runId = params.get('run') ?? rows[0]?.run_id ?? null
  const stored = useApi((s) => (runId ? getPashaRun(runId, s) : Promise.resolve(null)), [runId])
  const op = useOperation(runPasha)
  const busy = useRef(false)

  const run = useCallback(async (selected: VesselCandidate[]) => {
    const slick = ws.ctx.slick?.polygon
    if (busy.current || !analysisId || !slick || selected.length === 0) return null
    busy.current = true
    try {
      const r = await op.run({ analysis_id: analysisId, candidates: selected, observed_slick_geometry: slick })
      if (r) { ws.ctx.patchRefs({ pashaRunId: r.run_id }); setParams({ run: r.run_id }, { replace: true }); ws.history.retry() }
      return r
    } finally { busy.current = false }
  }, [ws, analysisId, op, setParams])

  const fresh = op.state.status === 'success' && op.state.data.run_id === runId ? op.state.data : null
  const result: PashaRunResult | null = fresh ?? stored.data
  const historyRow = rows.find((r) => r.run_id === runId) ?? null
  const select = useCallback((id: string) => setParams((p) => { const n = new URLSearchParams(p); n.set('run', id); return n }, { replace: true }), [setParams])
  return { op: op.state, run, reset: op.reset, result, stored, historyRow, rows, runId, select }
}
export type Pasha = ReturnType<typeof usePasha>

export function useElapsed(active: boolean): number {
  const [s, setS] = useState(0)
  useEffect(() => {
    if (!active) { setS(0); return }
    const t0 = Date.now()
    const h = window.setInterval(() => setS(Math.floor((Date.now() - t0) / 1000)), 1000)
    return () => window.clearInterval(h)
  }, [active])
  return s
}
