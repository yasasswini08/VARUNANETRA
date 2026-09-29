import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Info, RotateCcw, Search } from 'lucide-react'
import { SceneMap, type Bbox, type Footprint } from '../components/SceneMap'
import { SceneResultList } from '../components/scenes/SceneResultList'
import { EmptyState, ErrorState, SkeletonRows } from '../components/StateViews'
import { Pill } from '../components/StatusPill'
import { useSceneSearch } from '../hooks/useScenes'
import { useProviders, useScenes } from '../hooks/useMissionData'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { fromPersisted, fromSearch, type SceneRow } from '../lib/scene'
import type { SceneSearchParams } from '../api'
import { TAGLINE } from '../config/site'

const PAGE_SIZE = 10
const MAX_OPTIONS = [10, 20, 50, 100]
const CDSE = 'sentinel1_cdse'

interface Draft { minlon: string; minlat: string; maxlon: string; maxlat: string; start: string; end: string; max: string }

const isoDay = (d: Date) => d.toISOString().slice(0, 10)

/** Applied search = URL state. Returns null while the URL does not describe a complete search. */
function parseApplied(sp: URLSearchParams): (SceneSearchParams & { startDay: string; endDay: string }) | null {
  const n = (k: string) => (sp.has(k) && sp.get(k) !== '' ? Number(sp.get(k)) : NaN)
  const [minlon, minlat, maxlon, maxlat] = [n('minlon'), n('minlat'), n('maxlon'), n('maxlat')]
  const startDay = sp.get('start') ?? '', endDay = sp.get('end') ?? ''
  if ([minlon, minlat, maxlon, maxlat].some(Number.isNaN) || !startDay || !endDay) return null
  const max = Math.min(100, Math.max(1, Number(sp.get('max')) || 20))
  return { minlon, minlat, maxlon, maxlat, start: `${startDay}T00:00:00Z`, end: `${endDay}T23:59:59Z`, max_results: max, startDay, endDay }
}

function validate(d: Draft): { ok: true; p: Draft } | { ok: false; msg: string } {
  const v = [d.minlon, d.minlat, d.maxlon, d.maxlat].map((x) => (x.trim() === '' ? NaN : Number(x)))
  if (v.some(Number.isNaN)) return { ok: false, msg: 'Enter all four bounding-box coordinates, or draw an area on the map.' }
  const [minlon, minlat, maxlon, maxlat] = v
  if (minlon < -180 || maxlon > 180) return { ok: false, msg: 'Longitude must be between -180 and 180.' }
  if (minlat < -90 || maxlat > 90) return { ok: false, msg: 'Latitude must be between -90 and 90.' }
  if (minlon >= maxlon) return { ok: false, msg: 'Minimum longitude must be less than maximum longitude.' }
  if (minlat >= maxlat) return { ok: false, msg: 'Minimum latitude must be less than maximum latitude.' }
  if (!d.start || !d.end) return { ok: false, msg: 'Choose a start and end date.' }
  if (d.start > d.end) return { ok: false, msg: 'Start date must be on or before the end date.' }
  return { ok: true, p: d }
}

const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort()

export default function SceneExplorerPage() {
  useDocumentTitle('Scene Explorer')
  const [sp, setSp] = useSearchParams()
  const src = sp.get('src') === 'persisted' ? 'persisted' : 'cdse'
  const applied = useMemo(() => parseApplied(sp), [sp])
  const providers = useProviders()
  const cdse = providers.data?.providers.find((p) => p.name === CDSE)
  const notConfigured = providers.status === 'success' && cdse !== undefined && !cdse.configured

  const [draft, setDraft] = useState<Draft>(() => {
    const today = new Date()
    return {
      minlon: sp.get('minlon') ?? '', minlat: sp.get('minlat') ?? '', maxlon: sp.get('maxlon') ?? '', maxlat: sp.get('maxlat') ?? '',
      start: sp.get('start') ?? isoDay(new Date(today.getTime() - 30 * 864e5)), end: sp.get('end') ?? isoDay(today), max: sp.get('max') ?? '20',
    }
  })
  const [formError, setFormError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  const search = useSceneSearch(src === 'cdse' && applied ? applied : null)
  const persisted = useScenes()

  const patch = (u: Record<string, string | null>, replace = true) => {
    const next = new URLSearchParams(sp)
    for (const [k, v] of Object.entries(u)) { if (v === null || v === '') next.delete(k); else next.set(k, v) }
    setSp(next, { replace })
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const r = validate(draft)
    if (!r.ok) { setFormError(r.msg); return }
    setFormError(null); setSelected(null)
    const next = new URLSearchParams()
    for (const k of ['minlon', 'minlat', 'maxlon', 'maxlat', 'start', 'end', 'max'] as const) next.set(k, draft[k])
    setSp(next)
  }
  const reset = () => {
    setDraft({ ...draft, minlon: '', minlat: '', maxlon: '', maxlat: '' }); setFormError(null); setSelected(null); setSp(new URLSearchParams())
  }
  const setField = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setDraft({ ...draft, [k]: e.target.value })
  const onDraw = (b: Bbox) => setDraft({ ...draft, minlon: b.minlon.toFixed(3), minlat: b.minlat.toFixed(3), maxlon: b.maxlon.toFixed(3), maxlat: b.maxlat.toFixed(3) })

  // ---- rows for the active source ----
  const allRows: SceneRow[] = useMemo(() => {
    if (src === 'persisted') return persisted.status === 'success' ? fromPersisted(persisted.data.scenes) : []
    return search.state.status === 'success' ? fromSearch(search.state.data.scenes) : []
  }, [src, persisted.status, persisted.data, search.state])

  const pol = sp.get('pol') ?? '', orbit = sp.get('orbit') ?? '', ptype = sp.get('ptype') ?? '', sort = sp.get('sort') === 'oldest' ? 'oldest' : 'newest'
  const page = Math.max(1, Number(sp.get('page')) || 1)
  const polOpts = uniq(allRows.flatMap((r) => r.polarizations)), orbitOpts = uniq(allRows.map((r) => r.orbit)), typeOpts = uniq(allRows.map((r) => r.productType))

  const rows = useMemo(() => {
    const f = allRows.filter((r) => (!pol || r.polarizations.includes(pol)) && (!orbit || r.orbit === orbit) && (!ptype || r.productType === ptype))
    const t = (r: SceneRow) => (r.time ? new Date(r.time).getTime() : 0)
    return f.sort((a, b) => (sort === 'oldest' ? t(a) - t(b) : t(b) - t(a)))
  }, [allRows, pol, orbit, ptype, sort])

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const cur = Math.min(page, pages)
  const pageRows = rows.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE)
  const footprints: Footprint[] = rows.map((r) => ({ id: r.key, label: r.productId, rings: r.rings }))
  const aoi: Bbox | null = useMemo(() => {
    const v = [draft.minlon, draft.minlat, draft.maxlon, draft.maxlat].map((x) => (x.trim() === '' ? NaN : Number(x)))
    return v.some(Number.isNaN) || v[0] >= v[2] || v[1] >= v[3] ? null : { minlon: v[0], minlat: v[1], maxlon: v[2], maxlat: v[3] }
  }, [draft])

  const loading = src === 'cdse' ? search.state.status === 'loading' : persisted.status === 'loading'
  const refined = !!(pol || orbit || ptype)

  return (
    <>
      <header className="mc-head">
        <div>
          <span className="eyebrow">{TAGLINE}</span>
          <h1 style={{ marginTop: 10 }}>Scene Explorer</h1>
          <p>Search Sentinel-1 GRD scenes in the Copernicus Data Space Ecosystem catalogue, or review scenes already persisted by the backend.</p>
        </div>
        <div className="seg" role="tablist" aria-label="Scene source">
          <button role="tab" aria-selected={src === 'cdse'} onClick={() => { setSelected(null); patch({ src: null, page: null }) }}>Live CDSE search</button>
          <button role="tab" aria-selected={src === 'persisted'} onClick={() => { setSelected(null); patch({ src: 'persisted', page: null }) }}>Persisted scenes</button>
        </div>
      </header>

      <div className="se-grid">
        <section className="card se-criteria" aria-label="Search criteria">
          <div className="card__head"><h2 className="card__title">Search criteria</h2><button className="link-more btn-plain" onClick={reset}><RotateCcw size={13} /> Reset</button></div>
          <div className="card__body">
            {src === 'persisted' ? (
              <div className="note"><Info aria-hidden="true" /><span>Persisted scenes are read from <code>GET /api/scenes</code>. The backend does not filter this list by area or date; use the refinements below.</span></div>
            ) : (
              <form onSubmit={submit} noValidate className="form-stack">
                <fieldset>
                  <legend>Area of interest (bounding box)</legend>
                  <div className="grid-4">
                    <label>Min lon<input inputMode="decimal" value={draft.minlon} onChange={setField('minlon')} placeholder="e.g. 80.1" /></label>
                    <label>Min lat<input inputMode="decimal" value={draft.minlat} onChange={setField('minlat')} placeholder="e.g. 12.5" /></label>
                    <label>Max lon<input inputMode="decimal" value={draft.maxlon} onChange={setField('maxlon')} placeholder="e.g. 81.2" /></label>
                    <label>Max lat<input inputMode="decimal" value={draft.maxlat} onChange={setField('maxlat')} placeholder="e.g. 13.9" /></label>
                  </div>
                  <p className="hint">Type coordinates or use the draw tool on the map.</p>
                </fieldset>
                <fieldset>
                  <legend>Date range (UTC)</legend>
                  <div className="grid-2s">
                    <label>Start<input type="date" value={draft.start} max={draft.end || undefined} onChange={setField('start')} /></label>
                    <label>End<input type="date" value={draft.end} min={draft.start || undefined} onChange={setField('end')} /></label>
                  </div>
                </fieldset>
                <label>Maximum results
                  <select value={draft.max} onChange={setField('max')}>{MAX_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}</select>
                </label>
                {formError && <div className="form-error" role="alert">{formError}</div>}
                {notConfigured && <div className="note"><Info aria-hidden="true" /><span>Provider <code>{CDSE}</code> reports no credentials (CDSE_CLIENT_ID / CDSE_CLIENT_SECRET). A search will be rejected by the backend.</span></div>}
                <button className="btn btn--primary" type="submit" disabled={loading}><Search size={16} /> {loading ? 'Searching…' : 'Search scenes'}</button>
                <p className="hint">Searches the CDSE Sentinel-1 GRD collection via the backend. Area, date range and result count are the only server-side filters.</p>
              </form>
            )}

            {allRows.length > 0 && (
              <fieldset className="form-stack" style={{ marginTop: 18 }}>
                <legend>Refine loaded results</legend>
                <label>Polarization<select value={pol} onChange={(e) => patch({ pol: e.target.value, page: null })}><option value="">All</option>{polOpts.map((o) => <option key={o}>{o}</option>)}</select></label>
                {orbitOpts.length > 0 && <label>Orbit direction<select value={orbit} onChange={(e) => patch({ orbit: e.target.value, page: null })}><option value="">All</option>{orbitOpts.map((o) => <option key={o}>{o}</option>)}</select></label>}
                {typeOpts.length > 0 && <label>Product type<select value={ptype} onChange={(e) => patch({ ptype: e.target.value, page: null })}><option value="">All</option>{typeOpts.map((o) => <option key={o}>{o}</option>)}</select></label>}
                <p className="hint">Applied in the browser to scenes already returned.</p>
              </fieldset>
            )}
          </div>
        </section>

        <section className="card se-map" aria-label="Scene footprints">
          <div className="card__body">
            <SceneMap footprints={footprints} selectedId={selected} onSelect={setSelected} aoi={src === 'cdse' ? aoi : null} onDrawAoi={src === 'cdse' ? onDraw : undefined} />
          </div>
        </section>

        <section className="card se-results" aria-label="Search results" aria-busy={loading}>
          <div className="card__head">
            <h2 className="card__title">Results{allRows.length > 0 && <span className="count"> ({refined ? `${rows.length} of ${allRows.length}` : allRows.length})</span>}</h2>
            <label className="sort">Sort
              <select value={sort} onChange={(e) => patch({ sort: e.target.value === 'newest' ? null : e.target.value, page: null })}>
                <option value="newest">Newest first</option><option value="oldest">Oldest first</option>
              </select>
            </label>
          </div>
          <div className="card__body">
            {src === 'cdse' && search.state.status === 'idle' && (
              <EmptyState title="No search run yet">Define an area and date range, then choose Search scenes. Results come from the live CDSE catalogue.</EmptyState>
            )}
            {loading && <div role="status" aria-label="Searching for scenes"><p className="hint" style={{ marginBottom: 10 }}>Searching for scenes…</p><SkeletonRows rows={4} height={92} /></div>}
            {src === 'cdse' && search.state.status === 'error' && (
              <ErrorState error={search.state.error} onRetry={search.retry}
                title={search.state.error.reasonCode === 'PROVIDER_NOT_CONFIGURED' ? 'Provider not configured' : search.state.error.reasonCode === 'PROVIDER_UNAVAILABLE' ? 'Provider unavailable' : search.state.error.status === 422 ? 'Invalid search' : search.state.error.isUnreachable ? undefined : 'Scene search failed'} />
            )}
            {src === 'persisted' && persisted.status === 'error' && <ErrorState error={persisted.error} onRetry={persisted.retry} />}
            {!loading && ((src === 'cdse' && search.state.status === 'success') || (src === 'persisted' && persisted.status === 'success')) && (
              allRows.length === 0 ? (
                <EmptyState title="No scenes found">{src === 'cdse' ? 'The catalogue returned no Sentinel-1 GRD scenes for this area and date range. Try a wider area or longer period.' : 'No scenes have been persisted yet. Scenes are stored when a detection run registers them.'}</EmptyState>
              ) : rows.length === 0 ? (
                <EmptyState title="No scenes match the refinements" action={<button className="btn btn--sm" onClick={() => patch({ pol: null, orbit: null, ptype: null, page: null })}>Clear refinements</button>}>All {allRows.length} loaded scenes are filtered out.</EmptyState>
              ) : (
                <>
                  <SceneResultList rows={pageRows} selectedKey={selected} onSelect={setSelected} />
                  {pages > 1 && (
                    <nav className="pager" aria-label="Result pages">
                      <button className="btn btn--sm" disabled={cur <= 1} onClick={() => patch({ page: String(cur - 1) })}><ChevronLeft size={14} /> Previous</button>
                      <span className="mono">Page {cur} of {pages}</span>
                      <button className="btn btn--sm" disabled={cur >= pages} onClick={() => patch({ page: String(cur + 1) })}>Next <ChevronRight size={14} /></button>
                    </nav>
                  )}
                  {src === 'cdse' && search.state.status === 'success' && <div className="hint" style={{ marginTop: 10 }}><Pill tone="ok" flat>Search succeeded</Pill> Catalogue returned {search.state.data.count} scene{search.state.data.count === 1 ? '' : 's'}{applied && search.state.data.count >= applied.max_results ? ' (result limit reached — more may exist)' : ''}.</div>}
                </>
              )
            )}
          </div>
        </section>
      </div>
    </>
  )
}
