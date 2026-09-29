import { Suspense, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { ArrowRight, Menu, X } from 'lucide-react'
import { Logo } from './Logo'
import { PUBLIC_NAV } from '../config/site'
import { SkeletonRows } from './StateViews'

export function PublicLayout() {
  const [solid, setSolid] = useState(false)
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => {
    const on = () => setSolid(window.scrollY > 24)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  useEffect(() => { setOpen(false); window.scrollTo(0, 0) }, [pathname])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <header className={`pubnav${solid || pathname !== '/' ? ' is-solid' : ''}`}>
        <Logo />
        <nav aria-label="Primary" className="pubnav__links">
          {PUBLIC_NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={'end' in n ? n.end : false} className={({ isActive }) => (isActive ? 'active' : '')}>{n.label}</NavLink>
          ))}
        </nav>
        <div className="pubnav__cta">
          <Link to="/app" className="btn btn--primary btn--sm">Enter Mission Control <ArrowRight size={15} /></Link>
          <button className="menu-btn" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}><Menu size={20} /></button>
        </div>
      </header>

      {open && (
        <>
          <div className="drawer-scrim" onClick={() => setOpen(false)} />
          <aside className="drawer" aria-label="Menu">
            <div className="drawer__head">
              <Logo />
              <button className="menu-btn" style={{ display: 'inline-flex' }} aria-label="Close menu" onClick={() => setOpen(false)}><X size={20} /></button>
            </div>
            {PUBLIC_NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={'end' in n ? n.end : false} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>{n.label}</NavLink>
            ))}
            <Link to="/app" className="btn btn--primary" style={{ marginTop: 14 }}>Enter Mission Control</Link>
          </aside>
        </>
      )}

      <main id="main" className="route-fade" key={pathname}>
        <Suspense fallback={<div className="inner"><SkeletonRows rows={5} height={60} /></div>}>
          <Outlet />
        </Suspense>
      </main>
      <Footer />
    </>
  )
}

function Footer() {
  return (
    <footer className="footer">
      <div className="footer__grid">
        <div>
          <Logo />
          <p style={{ color: 'var(--muted)', fontSize: 13.5, marginTop: 16, maxWidth: '36ch' }}>
            Physics-constrained satellite oil-spill detection and evidence-based source attribution.
          </p>
        </div>
        <div>
          <h4>Explore</h4>
          <ul>{PUBLIC_NAV.map((n) => <li key={n.to}><Link to={n.to}>{n.label}</Link></li>)}</ul>
        </div>
        <div>
          <h4>Platform</h4>
          <ul>
            <li><Link to="/investigations/new">New Investigation</Link></li>
            <li><Link to="/scene-explorer">Scene Explorer</Link></li>
          </ul>
        </div>
      </div>
      <div className="footer__base">
        <span>© {new Date().getFullYear()} Varuna Netra</span>
        <span className="mono">Seeing the Ocean. Finding the Truth.</span>
      </div>
    </footer>
  )
}
