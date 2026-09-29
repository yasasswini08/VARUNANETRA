import { Link } from 'react-router-dom'
import { CalendarClock, ExternalLink, Satellite } from 'lucide-react'
import { formatDateTime } from '../../lib/format'
import type { SceneRow } from '../../lib/scene'
import { Pill } from '../StatusPill'

interface Props { rows: SceneRow[]; selectedKey: string | null; onSelect: (key: string) => void }

export function SceneResultList({ rows, selectedKey, onSelect }: Props) {
  return (
    <ul className="scene-list" aria-label="Scene results">
      {rows.map((r) => (
        <li key={r.key} className={`scene-card${selectedKey === r.key ? ' is-selected' : ''}`}>
          <button className="scene-card__main" onClick={() => onSelect(r.key)} aria-pressed={selectedKey === r.key}>
            <span className="scene-card__id mono">{r.productId}</span>
            <span className="scene-card__time"><CalendarClock size={13} aria-hidden="true" />{r.time ? formatDateTime(r.time) + ' UTC' : 'Acquisition time not provided'}</span>
            <span className="scene-card__tags">
              {r.polarizations.map((p) => <span className="tag" key={p}>{p}</span>)}
              {r.productType && <span className="tag">{r.productType}</span>}
              {r.orbit && <span className="tag">{r.orbit}</span>}
              {r.status && <Pill tone="muted" flat>{r.status}</Pill>}
            </span>
            <span className="scene-card__prov"><Satellite size={12} aria-hidden="true" />{r.provider}</span>
          </button>
          <div className="scene-card__actions">
            <Link className="btn btn--sm" to={`/scene-explorer/${encodeURIComponent(r.productId)}`} state={{ row: r.raw, source: r.source }}>
              View scene <ExternalLink size={13} aria-hidden="true" />
            </Link>
            <button className="btn btn--sm" disabled title="Creating an investigation from a scene arrives in Phase 3">Use scene · P3</button>
          </div>
        </li>
      ))}
    </ul>
  )
}
