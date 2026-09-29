import { Suspense, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  Anchor, Database, FileSearch, FileText, Home, Info, Layers, Mail, Menu, Radar, Search, Ship, Waypoints, X, BookOpen, FlaskConical, UploadCloud, type LucideIcon,
} from 'lucide-react'
import { Logo } from './Logo'
import { CommandBar } from './CommandBar'
import { SkeletonRows } from './StateViews'
import { TAGLINE } from '../config/site'

interface Item { to?: string; label: string; icon: LucideIcon; phase?: number; end?: boolean; scoped?: string }

const OPERATIONS: Item[] = [
  { to: '/app', label: 'Mission Control', icon: Home, end: true },
  { to: '/investigations/new', label: 'New Investigation', icon: Radar },
  { to: '/history', label: 'History', icon: Database },
]
const PHASE2: Item[] = [
  { to: '/sar-ingestion', label: 'SAR Ingestion', icon: UploadCloud },
  { to: '/scene-explorer', label: 'Scene Explorer', icon: Search },
]
/** Investigation-scoped tools: they link into the investigation currently open in the URL. */
const SCOPED: Item[] = [
  { label: 'Vessel Intelligence', icon: Ship, scoped: 'vessels' },
  { label: 'PASHA Simulation', icon: Waypoints, scoped: 'pasha' },
  { label: 'Evidence', icon: FileSearch, scoped: 'evidence' },
  { label: 'Report', icon: FileText, scoped: 'report' },
]
const REFERENCE: Item[] = [
  { to: '/project', label: 'Project Overview', icon: Info },
  { to: '/case-studies', label: 'Case Studies', icon: BookOpen },
  { to: '/data-resources', label: 'Data Resources', icon: Layers },
  { to: '/contact', label: 'Contact', icon: Mail },
]

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname } = useLocation()
  const invId = /^\/investigations\/([^/]+)/.exec(pathname)?.[1]
  const openId = invId && invId !== 'new' ? invId : null
  const render = (raw: Item) => {
    const i: Item = raw.scoped && openId ? { ...raw, to: `/investigations/${openId}/${raw.scoped}` } : raw
    const Icon = i.icon
    if (!i.to && i.scoped) {
      return (
        <div key={i.label} className="nav-item is-future" aria-disabled="true" title="Open an investigation to use this">
          <Icon /> {i.label} <span className="soon">Open case</span>
        </div>
      )
    }
    if (!i.to) {
      return (
        <div key={i.label} className="nav-item is-future" aria-disabled="true" title={`Available in Phase ${i.phase}`}>
          <Icon /> {i.label} <span className="soon">P{i.phase}</span>
        </div>
      )
    }
    return (
      <NavLink key={i.label} to={i.to} end={i.end} onClick={onNavigate} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
        <Icon /> {i.label}
      </NavLink>
    )
  }
  return (
    <nav aria-label="Application">
      <div className="nav-group">Operations</div>
      {OPERATIONS.map(render)}
      <div className="nav-group">Satellite data</div>
      {PHASE2.map(render)}
      <div className="nav-group">Investigation tools</div>
      {SCOPED.map(render)}
      <div className="nav-group">Reference</div>
      {REFERENCE.map(render)}
    </nav>
  )
}

export function AppLayout() {
  const [open, setOpen] = useState(false)
  const [cmd, setCmd] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCmd((v) => !v) }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => setOpen(false), [pathname])

  return (
    <div className="app">
      <a href="#main" className="skip-link">Skip to content</a>
      <aside className="sidebar">
        <Logo />
        <NavItems />
        <div className="sidebar__foot">
          <Anchor size={16} style={{ color: 'var(--primary)', marginBottom: 6 }} />
          <div>{TAGLINE}</div>
          <div className="mono" style={{ marginTop: 6 }}>Phase 5</div>
        </div>
      </aside>

      {open && (
        <>
          <div className="drawer-scrim" onClick={() => setOpen(false)} />
          <aside className="drawer" aria-label="Menu">
            <div className="drawer__head">
              <Logo />
              <button className="menu-btn" style={{ display: 'inline-flex' }} aria-label="Close menu" onClick={() => setOpen(false)}><X size={20} /></button>
            </div>
            <NavItems onNavigate={() => setOpen(false)} />
          </aside>
        </>
      )}

      <div className="app__main">
        <header className="topbar">
          <button className="menu-btn app-menu" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}><Menu size={20} /></button>
          <button className="cmd-trigger" onClick={() => setCmd(true)} aria-label="Open command bar">
            <Search size={16} /> <span className="label-long">Jump to a page or investigation…</span><kbd>Ctrl K</kbd>
          </button>
          <div className="topbar__spacer" />
          <span className="pill pill--muted pill--flat"><FlaskConical size={13} /> Phase 5</span>
        </header>
        <main id="main" className="app__content route-fade" key={pathname}>
          <Suspense fallback={<SkeletonRows rows={5} height={80} />}><Outlet /></Suspense>
        </main>
      </div>
      {cmd && <CommandBar onClose={() => setCmd(false)} />}
    </div>
  )
}
