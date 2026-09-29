import { Link } from 'react-router-dom'
import { EmptyState } from '../StateViews'
import { StatusPill } from '../StatusPill'
import { fmtLat, fmtLon, formatDateTime, outerRings, ringCenter } from '../../lib/format'
import type { Incident } from '../../types/api'

export function incidentCenter(i: Incident): string {
  const r = outerRings(i.bbox)[0]
  if (!r) return '—'
  const [lon, lat] = ringCenter(r)
  return `${fmtLat(lat)} ${fmtLon(lon)}`
}

export function RecentInvestigations({ incidents, selectedId, onSelect }: { incidents: Incident[]; selectedId: string | null; onSelect: (id: string) => void }) {
  if (incidents.length === 0) {
    return <EmptyState title="No active investigations">No incident records exist in the backend yet. Investigations will be listed here once created.</EmptyState>
  }
  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead><tr><th>ID</th><th>Name</th><th>Area centre</th><th>Created</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>
          {incidents.slice(0, 6).map((i) => (
            <tr key={i.id} style={selectedId === i.id ? { background: 'var(--primary-dim)' } : undefined} onMouseEnter={() => onSelect(i.id)}>
              <td><span className="id-link" title={i.id}>{i.id.slice(0, 8)}</span></td>
              <td>{i.name}</td>
              <td className="mono">{incidentCenter(i)}</td>
              <td className="mono">{formatDateTime(i.created_at)}</td>
              <td><StatusPill status={i.status} /></td>
              <td><Link className="btn btn--sm" to={`/investigations/${i.id}`}>Open</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
