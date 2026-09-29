import type { VarunaErrorBody } from '../types/api'

/** Base URL comes from the environment; docker-compose sets http://localhost:8000/api. */
export const API_BASE_URL: string = (
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api'
).replace(/\/+$/, '')

export type ApiErrorKind = 'network' | 'http' | 'parse'

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status: number | null
  readonly reasonCode: string | null

  constructor(kind: ApiErrorKind, message: string, status: number | null = null, reasonCode: string | null = null) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.status = status
    this.reasonCode = reasonCode
  }

  get isUnreachable(): boolean {
    return this.kind === 'network'
  }
}

function isVarunaErrorBody(v: unknown): v is VarunaErrorBody {
  return typeof v === 'object' && v !== null && 'reason_code' in v && 'message' in v
}

function messageFromBody(body: unknown, status: number): { message: string; reason: string | null } {
  let message = `Request failed (${status})`
  let reason: string | null = null
  if (isVarunaErrorBody(body)) {
    message = body.message
    reason = body.reason_code
  } else if (typeof body === 'object' && body !== null && 'detail' in body) {
    const d = (body as { detail: unknown }).detail
    if (typeof d === 'string') message = d
    else if (Array.isArray(d)) {
      const msgs = d.map((e) => (typeof e === 'object' && e !== null && 'msg' in e ? String((e as { msg: unknown }).msg) : '')).filter(Boolean)
      if (msgs.length) message = msgs.join('; ')
    }
  }
  return { message, reason }
}

export async function apiGet<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
  signal?: AbortSignal,
): Promise<T> {
  const url = new URL(`${API_BASE_URL}${path}`, window.location.origin)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) url.searchParams.set(k, String(v))
    }
  }

  let res: Response
  try {
    res = await fetch(url.toString(), { headers: { Accept: 'application/json' }, signal })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError('network', 'Backend connection unavailable')
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`
    let reason: string | null = null
    try {
      const body: unknown = await res.json()
      if (isVarunaErrorBody(body)) {
        message = body.message
        reason = body.reason_code
      } else if (typeof body === 'object' && body !== null && 'detail' in body) {
        const d = (body as { detail: unknown }).detail
        if (typeof d === 'string') message = d
        else if (Array.isArray(d)) {
          // FastAPI validation errors: [{ loc, msg, type }]
          const msgs = d.map((e) => (typeof e === 'object' && e !== null && 'msg' in e ? String((e as { msg: unknown }).msg) : '')).filter(Boolean)
          if (msgs.length) message = msgs.join('; ')
        }
      }
    } catch {
      /* non-JSON error body: keep generic message */
    }
    throw new ApiError('http', message, res.status, reason)
  }

  try {
    return (await res.json()) as T
  } catch {
    throw new ApiError('parse', 'Backend returned an unreadable response', res.status)
  }
}

/** Multipart upload with progress (fetch cannot report upload progress). Resolves parsed JSON. */
export function apiUpload<T>(
  path: string,
  form: FormData,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API_BASE_URL}${path}`)
    xhr.setRequestHeader('Accept', 'application/json')
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded / e.total) }
    xhr.onerror = () => reject(new ApiError('network', 'Backend connection unavailable'))
    xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'))
    xhr.onload = () => {
      let body: unknown = null
      try { body = JSON.parse(xhr.responseText) } catch { /* non-JSON */ }
      if (xhr.status >= 200 && xhr.status < 300) {
        if (body === null) reject(new ApiError('parse', 'Backend returned an unreadable response', xhr.status))
        else resolve(body as T)
        return
      }
      let message = `Request failed (${xhr.status})`
      let reason: string | null = null
      if (isVarunaErrorBody(body)) { message = body.message; reason = body.reason_code }
      else if (typeof body === 'object' && body !== null && 'detail' in body && typeof (body as { detail: unknown }).detail === 'string') message = (body as { detail: string }).detail
      reject(new ApiError('http', message, xhr.status, reason))
    }
    signal?.addEventListener('abort', () => xhr.abort())
    xhr.send(form)
  })
}

/** JSON or form POST. Long-running backend calls (drift, environment) are simply awaited; no timeout is invented. */
export async function apiPost<T>(path: string, body: Record<string, unknown> | FormData, signal?: AbortSignal): Promise<T> {
  const isForm = body instanceof FormData
  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: isForm ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: isForm ? body : JSON.stringify(body),
      signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError('network', 'Backend connection unavailable')
  }
  let parsed: unknown = null
  try { parsed = await res.json() } catch { /* non-JSON body */ }
  if (!res.ok) {
    const { message, reason } = messageFromBody(parsed, res.status)
    throw new ApiError('http', message, res.status, reason)
  }
  if (parsed === null) throw new ApiError('parse', 'Backend returned an unreadable response', res.status)
  return parsed as T
}

export interface BlobResult { blob: Blob; filename: string | null; contentType: string }

/** Binary GET (e.g. the report PDF). Errors are parsed exactly like JSON endpoints. */
export async function apiBlob(path: string, signal?: AbortSignal): Promise<BlobResult> {
  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}${path}`, { signal })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError('network', 'Backend connection unavailable')
  }
  if (!res.ok) {
    let parsed: unknown = null
    try { parsed = await res.json() } catch { /* non-JSON error body */ }
    const { message, reason } = messageFromBody(parsed, res.status)
    throw new ApiError('http', message, res.status, reason)
  }
  const blob = await res.blob()
  const cd = res.headers.get('Content-Disposition')
  const m = cd ? /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd) : null
  return { blob, filename: m ? decodeURIComponent(m[1]) : null, contentType: res.headers.get('Content-Type') ?? blob.type }
}
