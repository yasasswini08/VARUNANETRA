import { Link } from 'react-router-dom'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

export default function NotFoundPage() {
  useDocumentTitle('Not found')
  return (
    <div className="inner" style={{ textAlign: 'center', paddingTop: 200 }}>
      <span className="eyebrow">404</span>
      <h1 style={{ fontSize: 56, margin: '12px 0' }}>Off the chart.</h1>
      <p style={{ color: 'var(--text-2)', marginBottom: 24 }}>That page does not exist.</p>
      <Link to="/" className="btn btn--primary">Return home</Link>
    </div>
  )
}
