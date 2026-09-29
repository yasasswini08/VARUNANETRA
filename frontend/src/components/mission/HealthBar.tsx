import { RefreshCw } from 'lucide-react'
import { Pill } from '../StatusPill'
import { useHealth } from '../../hooks/useMissionData'
import { API_BASE_URL } from '../../api'

export function HealthBar() {
  const h = useHealth()
  return (
    <div className="status-line" aria-live="polite">
      {h.status === 'loading' && <Pill tone="active">Checking</Pill>}
      {h.status === 'success' && <Pill tone="ok">Operational</Pill>}
      {h.status === 'error' && <Pill tone="err">{h.error.isUnreachable ? 'Unavailable' : 'Degraded'}</Pill>}
      {h.status === 'success' && (
        <>
          <span className="tag mono">mode: {h.data.app_mode}</span>
          <span className="tag mono">model: {h.data.model_version}</span>
        </>
      )}
      {h.status === 'error' && (
        <>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>{h.error.message}</span>
          <span className="tag mono">{API_BASE_URL}</span>
          <button className="btn btn--sm" onClick={h.retry}><RefreshCw size={13} /> Retry</button>
        </>
      )}
    </div>
  )
}
