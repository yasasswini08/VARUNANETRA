import { useCallback } from 'react'
import { ApiError } from '../api/client'
import { fetchReportPdf, generateReport, getReportsFor } from '../api'
import { useApi } from './useApi'
import { useOperation } from './useOperation'
import type { Workspace } from './useWorkspace'
import type { Pasha } from './usePasha'
import { reportMetadata } from '../lib/evidence'
import type { Canon } from '../lib/status'
import type { ReportSummary } from '../types/api'

/** Stored reports for one incident (GET /reports?incident_id=), newest first, plus POST …/generate. */
export function useReports(ws: Workspace, pasha: Pasha) {
  const list = useApi((s) => getReportsFor(ws.id, s), [ws.id])
  const gen = useOperation(generateReport)
  const reports: ReportSummary[] = list.data?.reports ?? []
  const analysisId = ws.drift.analysis?.id

  const blocked: string | null =
    !pasha.runId || !pasha.result ? 'A PASHA run is required. The backend builds the report from a stored counterfactual run.'
    : !analysisId ? 'A drift analysis is required.'
    : !ws.ctx.slick?.polygon ? 'No observed slick polygon is available from M1.'
    : null

  const generate = useCallback(async () => {
    if (blocked || !pasha.runId) return null
    const r = await gen.run(ws.id, reportMetadata(ws, pasha.runId))
    if (r) list.retry()
    return r
  }, [blocked, pasha.runId, gen, ws, list])

  return { list, reports, gen: gen.state, generate, resetGen: gen.reset, blocked }
}
export type ReportsCtx = ReturnType<typeof useReports>

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.rel = 'noopener'
  document.body.appendChild(a); a.click(); a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

export const reportFilename = (id: string, fromHeader: string | null) => fromHeader ?? `varuna-netra-${id}.pdf`

/** Fetches the real PDF from the backend. `open` uses a window opened synchronously so popup blockers allow it. */
export function usePdfActions() {
  const op = useOperation(async (id: string, mode: 'download' | 'open') => {
    const win = mode === 'open' ? window.open('', '_blank') : null
    try {
      const r = await fetchReportPdf(id)
      if (r.contentType && !r.contentType.includes('pdf')) throw new ApiError('parse', 'The backend response was not a PDF file')
      if (mode === 'download') saveBlob(r.blob, reportFilename(id, r.filename))
      else if (win) { win.location.href = URL.createObjectURL(r.blob) }
      return { id, mode }
    } catch (e) { win?.close(); throw e }
  })
  return { state: op.state, download: (id: string) => op.run(id, 'download'), open: (id: string) => op.run(id, 'open'), reset: op.reset }
}

export function reportState(r: ReportsCtx): Canon {
  if (r.gen.status === 'running') return 'running'
  if (r.gen.status === 'error') return 'failed'
  if (r.list.status === 'error') return 'unavailable'
  if (r.reports.length) return 'complete'
  return r.blocked ? 'not-executed' : 'ready'
}
