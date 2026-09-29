import type { ReactNode } from 'react'
import { Database, FileText, Satellite, Target } from 'lucide-react'
import { Skeleton } from '../StateViews'
import { LIST_LIMIT } from '../../api'
import type { ApiState } from '../../hooks/useApi'

type Listy<T> = ApiState<T> & { retry: () => void }

function Metric({ icon, label, state, count, note }: { icon: ReactNode; label: string; state: 'loading' | 'success' | 'error'; count?: number; note: string }) {
  const value = state === 'loading' ? <Skeleton height={30} width={70} /> : state === 'error' ? '—' : count === LIST_LIMIT ? `${count}+` : String(count)
  return (
    <div className="card metric">
      <div className="metric__icon" aria-hidden="true">{icon}</div>
      <div>
        <div className="metric__value">{value}</div>
        <div className="metric__label">{label}</div>
        <div className="metric__note">{state === 'error' ? 'unavailable' : note}</div>
      </div>
    </div>
  )
}

interface Props {
  incidents: Listy<{ incidents: unknown[] }>
  scenes: Listy<{ scenes: unknown[] }>
  observations: Listy<{ observations: unknown[] }>
  reports: Listy<{ reports: unknown[] }>
}

export function Metrics({ incidents, scenes, observations, reports }: Props) {
  return (
    <section className="metrics" aria-label="Operational metrics">
      <Metric icon={<Target />} label="Investigations" state={incidents.status} count={incidents.data?.incidents.length} note="incident records" />
      <Metric icon={<Satellite />} label="Satellite scenes" state={scenes.status} count={scenes.data?.scenes.length} note="persisted scenes" />
      <Metric icon={<Database />} label="SAR observations" state={observations.status} count={observations.data?.observations.length} note="ingested uploads" />
      <Metric icon={<FileText />} label="Reports generated" state={reports.status} count={reports.data?.reports.length} note="evidence reports" />
    </section>
  )
}
