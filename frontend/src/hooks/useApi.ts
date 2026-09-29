import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../api/client'

export type ApiState<T> =
  | { status: 'loading'; data: null; error: null }
  | { status: 'success'; data: T; error: null }
  | { status: 'error'; data: null; error: ApiError }

/** Minimal fetch hook: loading / success / error, abortable, with retry. */
export function useApi<T>(fetcher: (signal: AbortSignal) => Promise<T>, deps: readonly unknown[] = []) {
  const [state, setState] = useState<ApiState<T>>({ status: 'loading', data: null, error: null })
  const [tick, setTick] = useState(0)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  useEffect(() => {
    const ctl = new AbortController()
    setState({ status: 'loading', data: null, error: null })
    fetcherRef.current(ctl.signal).then(
      (data) => { if (!ctl.signal.aborted) setState({ status: 'success', data, error: null }) },
      (err: unknown) => {
        if (ctl.signal.aborted) return
        const error = err instanceof ApiError ? err : new ApiError('network', 'Backend connection unavailable')
        setState({ status: 'error', data: null, error })
      },
    )
    return () => ctl.abort()
  }, [tick, ...deps])

  const retry = useCallback(() => setTick((t) => t + 1), [])
  return { ...state, retry }
}
