import { getHealth, getIncidents, getObservationDetail, getObservations, getProvidersStatus, getReports, getScenes } from '../api'
import { useApi } from './useApi'

/** Each request is independent so one failing endpoint never blanks the whole dashboard. */
export const useHealth = () => useApi((s) => getHealth(s))
export const useProviders = () => useApi((s) => getProvidersStatus(s))
export const useIncidents = () => useApi((s) => getIncidents(s))
export const useScenes = () => useApi((s) => getScenes(s))
export const useReports = () => useApi((s) => getReports(s))
export const useObservations = () => useApi((s) => getObservations(s))

export const useObservationDetail = (id: string | null) => useApi((s) => (id ? getObservationDetail(id, s) : Promise.resolve(null)), [id])
