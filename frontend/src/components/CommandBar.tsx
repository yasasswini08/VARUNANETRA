import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getIncidents } from '../api'
import { PUBLIC_NAV } from '../config/site'
import type { Incident } from '../types/api'

interface Cmd { key: string; group: string; label: string; hint?: string; to: string }

/** Navigation + real incident search. Every entry navigates somewhere real. */
export function CommandBar({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const [incidents, setIncidents] = useState<Incident[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    const ctl = new AbortController()
    getIncidents(ctl.signal).then((r) => setIncidents(r.incidents), () => { /* backend unavailable: pages still searchable */ })
    return () => ctl.abort()
  }, [])

  const items = useMemo<Cmd[]>(() => {
    const pages: Cmd[] = [{ key: 'mc', group: 'Pages', label: 'Mission Control', to: '/app' },
      { key: 'ni', group: 'Pages', label: 'New Investigation', to: '/investigations/new' },
      { key: 'sar', group: 'Pages', label: 'SAR Ingestion', to: '/sar-ingestion' },
      { key: 'se', group: 'Pages', label: 'Scene Explorer', to: '/scene-explorer' },
      ...PUBLIC_NAV.filter((n) => n.to !== '/app').map((n) => ({ key: n.to, group: 'Pages', label: n.label, to: n.to }))]
    const inc: Cmd[] = incidents.map((i) => ({ key: i.id, group: 'Investigations', label: i.name, hint: i.id.slice(0, 8), to: `/investigations/${i.id}` }))
    const inc2: Cmd[] = incidents.flatMap((i) => [
      { key: `${i.id}-ev`, group: 'Evidence & reports', label: `${i.name} · Evidence`, hint: i.id.slice(0, 8), to: `/investigations/${i.id}/evidence` },
      { key: `${i.id}-rp`, group: 'Evidence & reports', label: `${i.name} · Report`, hint: i.id.slice(0, 8), to: `/investigations/${i.id}/report` },
    ])
    const needle = q.trim().toLowerCase()
    return [...pages, ...inc, ...inc2].filter((c) => !needle || c.label.toLowerCase().includes(needle) || c.key.toLowerCase().includes(needle)).slice(0, 30)
  }, [q, incidents])

  useEffect(() => setSel(0), [q])

  const go = (c: Cmd) => { navigate(c.to); onClose() }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, items.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)) }
    else if (e.key === 'Enter' && items[sel]) go(items[sel])
  }

  let lastGroup = ''
  return (
    <div className="cmd-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="cmd" role="dialog" aria-modal="true" aria-label="Command bar" onKeyDown={onKey}>
        <input ref={inputRef} className="cmd__input" placeholder="Search pages and investigations…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        <div className="cmd__list" role="listbox">
          {items.length === 0 && <div className="cmd__empty">No matches</div>}
          {items.map((c, i) => {
            const head = c.group !== lastGroup ? <div className="cmd__group" key={`g-${c.group}`}>{c.group}</div> : null
            lastGroup = c.group
            return (
              <div key={c.key}>
                {head}
                <button role="option" aria-selected={i === sel} className="cmd__item" onMouseEnter={() => setSel(i)} onClick={() => go(c)}>
                  {c.label}{c.hint && <small>{c.hint}</small>}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
