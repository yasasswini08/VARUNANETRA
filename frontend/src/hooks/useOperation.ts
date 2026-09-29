import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../api/client'

export type OpState<R> =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'success'; data: R }
  | { status: 'error'; error: ApiError }

/** A user-triggered backend call. `running` is true only while the request is genuinely in flight. */
export function useOperation<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const [state, setState] = useState<OpState<R>>({ status: 'idle' })
  const fnRef = useRef(fn)
  fnRef.current = fn
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  const run = useCallback(async (...args: A): Promise<R | null> => {
    setState({ status: 'running' })
    try {
      const data = await fnRef.current(...args)
      if (alive.current) setState({ status: 'success', data })
      return data
    } catch (err) {
      if (alive.current) setState({ status: 'error', error: err instanceof ApiError ? err : new ApiError('network', 'Backend connection unavailable') })
      return null
    }
  }, [])
  const reset = useCallback(() => setState({ status: 'idle' }), [])
  return { state, run, reset }
}
