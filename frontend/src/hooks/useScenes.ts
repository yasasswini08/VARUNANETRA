import { useCallback, useEffect, useState } from 'react'
import { ApiError, getSceneDetail, searchScenes, type SceneSearchParams } from '../api'
import { useApi } from './useApi'
import type { SceneSearchResponse } from '../types/api'

export type SearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: SceneSearchResponse }
  | { status: 'error'; error: ApiError }

/** Live CDSE search. `params === null` means no search requested yet (idle). Re-runs when params change. */
export function useSceneSearch(params: SceneSearchParams | null) {
  const [state, setState] = useState<SearchState>({ status: 'idle' })
  const [tick, setTick] = useState(0)
  const key = params ? JSON.stringify(params) : null

  useEffect(() => {
    if (key === null) { setState({ status: 'idle' }); return }
    const ctl = new AbortController()
    setState({ status: 'loading' })
    searchScenes(JSON.parse(key) as SceneSearchParams, ctl.signal).then(
      (data) => { if (!ctl.signal.aborted) setState({ status: 'success', data }) },
      (err: unknown) => {
        if (ctl.signal.aborted) return
        setState({ status: 'error', error: err instanceof ApiError ? err : new ApiError('network', 'Backend connection unavailable') })
      },
    )
    return () => ctl.abort()
  }, [key, tick])

  return { state, retry: useCallback(() => setTick((t) => t + 1), []) }
}

export const useScene = (productId: string) => useApi((s) => getSceneDetail(productId, s), [productId])
