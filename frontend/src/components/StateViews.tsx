import type { ReactNode } from 'react'
import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react'
import type { ApiError } from '../api/client'

export function Skeleton({ height = 16, width = '100%' }: { height?: number; width?: string | number }) {
  return <div className="skel" style={{ height, width }} aria-hidden="true" />
}

export function SkeletonRows({ rows = 4, height = 44 }: { rows?: number; height?: number }) {
  return (
    <div role="status" aria-label="Loading" style={{ display: 'grid', gap: 10, padding: 6 }}>
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} height={height} />)}
    </div>
  )
}

export function ErrorState({ error, onRetry, compact, title: titleOverride }: { error: ApiError; onRetry: () => void; compact?: boolean; title?: string }) {
  const title = titleOverride ?? (error.isUnreachable ? 'Backend connection unavailable' : 'Request failed')
  const body = error.isUnreachable
    ? 'The API did not respond. Check that the backend is running and VITE_API_BASE_URL is correct.'
    : error.message
  return (
    <div className="state state--error" role="alert" style={compact ? { padding: '18px 12px' } : undefined}>
      <AlertTriangle aria-hidden="true" />
      <h3>{title}</h3>
      <p>{body}</p>
      {error.reasonCode && <code className="mono">{error.reasonCode}</code>}
      <button className="btn btn--sm" onClick={onRetry}><RefreshCw size={14} /> Retry</button>
    </div>
  )
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="state">
      <Inbox aria-hidden="true" />
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}
