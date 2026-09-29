import { Link } from 'react-router-dom'

export function LogoMark({ className = 'logo__mark' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <circle cx="32" cy="32" r="19" stroke="#3fd8e8" strokeWidth="2" />
      <circle cx="32" cy="32" r="10" stroke="#3fd8e8" strokeWidth="1.2" opacity=".55" />
      <path d="M32 4v13M32 47v13M4 32h13M47 32h13" stroke="#3fd8e8" strokeWidth="2" strokeLinecap="round" />
      <circle cx="32" cy="32" r="4" fill="#3fd8e8" />
    </svg>
  )
}

export function Logo({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="logo" aria-label="Varuna Netra — home">
      <LogoMark />
      <span className="logo__text">
        <span className="logo__name">Varuna <b>Netra</b></span>
        <span className="logo__sub">Ocean Intelligence Platform</span>
      </span>
    </Link>
  )
}
