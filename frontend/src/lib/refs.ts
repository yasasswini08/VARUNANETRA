import type { EnvironmentSummary, ForecastResponse, VesselCandidatesResponse } from '../types/api'

/**
 * The backend has no endpoint that lists a drift analysis or detection run by incident,
 * so the ids it returned are remembered in this browser only. Everything shown is still
 * re-read from the backend by id; cached summaries are labelled as browser-cached.
 */
export interface InvestigationRefs {
  detectionId?: string
  analysisId?: string
  ageMin?: number
  ageMax?: number
  wind?: EnvironmentSummary
  currents?: EnvironmentSummary
  forecast?: ForecastResponse
  vessels?: VesselCandidatesResponse
  pashaRunId?: string
}

const key = (id: string) => `varuna.investigation.${id}`

export function readRefs(id: string): InvestigationRefs {
  try {
    const raw = window.localStorage.getItem(key(id))
    return raw ? (JSON.parse(raw) as InvestigationRefs) : {}
  } catch { return {} }
}

export function writeRefs(id: string, patch: Partial<InvestigationRefs>): InvestigationRefs {
  const next = { ...readRefs(id), ...patch }
  try { window.localStorage.setItem(key(id), JSON.stringify(next)) } catch { /* storage unavailable: state stays in memory */ }
  return next
}
