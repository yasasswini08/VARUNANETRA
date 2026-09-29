import { Info } from 'lucide-react'
import { ErrorState, SkeletonRows } from '../StateViews'
import { Pill } from '../StatusPill'
import { DATA_RESOURCES } from '../../data/resources'
import type { ProvidersStatusResponse } from '../../types/api'
import type { ApiState } from '../../hooks/useApi'

export const providerTitle = (name: string) => DATA_RESOURCES.find((d) => d.providerName === name)?.title ?? name

export function ProviderList({ state, retry }: { state: ApiState<ProvidersStatusResponse>; retry: () => void }) {
  if (state.status === 'loading') return <SkeletonRows rows={4} height={40} />
  if (state.status === 'error') return <ErrorState error={state.error} onRetry={retry} compact />
  return (
    <>
      <ul>
        {state.data.providers.map((p) => (
          <li className="prov" key={p.name}>
            <div className="prov__name">{providerTitle(p.name)}<small>{p.name}</small></div>
            {p.configured ? <Pill tone="ok">Configured</Pill> : <Pill tone="warn">Not configured</Pill>}
          </li>
        ))}
      </ul>
      <div className="note" style={{ marginTop: 12 }}>
        <Info aria-hidden="true" />
        <span>Reports whether credentials are present in the backend environment, not whether the upstream service is reachable.</span>
      </div>
    </>
  )
}
