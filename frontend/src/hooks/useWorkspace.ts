import { useApi } from './useApi'
import { useDetection, useDrift, useEnvironment, useInvestigation, useInvestigationProgress, useVessels } from './useInvestigation'
import { useProviders } from './useMissionData'
import { listPashaRuns } from '../api'

/** The same hook composition the Phase 3 workspace uses, shared with the Phase 4 pages. */
export function useWorkspace(id: string) {
  const ctx = useInvestigation(id)
  const providers = useProviders()
  const detection = useDetection(ctx, id)
  const env = useEnvironment(ctx)
  const drift = useDrift(ctx, id)
  const vessels = useVessels(ctx, drift.analysis?.id)
  const stages = useInvestigationProgress({ ctx, providers: providers.data, detection, env, drift, vessels })
  const history = useApi((s) => listPashaRuns(id, s), [id])
  return { id, ctx, providers, detection, env, drift, vessels, stages, history, incident: ctx.incident.data?.incident ?? null }
}
export type Workspace = ReturnType<typeof useWorkspace>
