import { Download, ExternalLink, Loader2 } from 'lucide-react'
import { OpError } from '../investigation/parts'
import { BackendStatus } from '../p4/parts'
import { Scroller, Missing } from './parts'
import { usePdfActions } from '../../hooks/useReports'
import { formatDateTime } from '../../lib/format'
import type { ReportSummary } from '../../types/api'

/** Stored reports with real Open / Download actions. Both fetch GET /reports/{id}; nothing is faked when the file is gone. */
export function ReportList({ reports }: { reports: ReportSummary[] }) {
  const pdf = usePdfActions()
  const busyId = pdf.state.status === 'running' ? 'busy' : null
  return (
    <div>
      <Scroller label="Generated reports">
        <table className="tbl">
          <caption className="sr-only">Reports generated for this investigation, newest first</caption>
          <thead><tr><th scope="col">Report ID</th><th scope="col">Generated</th><th scope="col">Decision status</th><th scope="col">Leading MMSI</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.id}>
                <td><span className="mono" title={r.id}>{r.id.slice(0, 8)}</span></td>
                <td className="mono">{formatDateTime(r.generated_at)}</td>
                <td><BackendStatus status={r.decision_status} /></td>
                <td className="mono">{r.leading_candidate_mmsi ?? <Missing>None designated</Missing>}</td>
                <td>
                  <div className="p5-rowact">
                    <button type="button" className="btn btn--sm" disabled={!!busyId} onClick={() => void pdf.open(r.id)} aria-label={`Open report ${r.id.slice(0, 8)} as PDF`}><ExternalLink size={13} aria-hidden="true" /> Open</button>
                    <button type="button" className="btn btn--sm" disabled={!!busyId} onClick={() => void pdf.download(r.id)} aria-label={`Download report ${r.id.slice(0, 8)} as PDF`}><Download size={13} aria-hidden="true" /> Download</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Scroller>
      <div aria-live="polite">
        {pdf.state.status === 'running' && <p className="hint"><Loader2 size={13} className="spin" aria-hidden="true" /> Fetching the PDF from the backend…</p>}
      </div>
      {pdf.state.status === 'error' && <OpError error={pdf.state.error} onRetry={pdf.reset} title="The report file could not be retrieved" />}
      <p className="hint">The PDF is rendered by the backend (WeasyPrint) and stored on the backend host. If that file is no longer present the backend reports it as missing; nothing is regenerated here.</p>
    </div>
  )
}
