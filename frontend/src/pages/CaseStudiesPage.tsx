import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, X } from 'lucide-react'
import { CASE_STUDIES, DEMO_OUTCOME, DEMO_STEP_TEXT, type CaseCategory, type CaseStudy } from '../data/demo/caseStudies'
import { CanonStatus } from '../components/CanonStatus'
import { CaseArt } from '../components/CaseArt'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

const CATS: ('All' | CaseCategory)[] = ['All', 'Oil Spill', 'Illegal Dumping', 'Vessel Behaviour', 'Environmental']

function CaseModal({ c, onClose }: { c: CaseStudy; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal cs-modal" role="dialog" aria-modal="true" aria-labelledby="case-title">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="badge-demo">DEMO CASE</span>
          <button className="menu-btn" style={{ display: 'inline-flex' }} onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <h2 id="case-title">{c.title}</h2>
        <div className="case__meta"><span>{c.category}</span><span>{c.region}</span><span>{c.investigationType}</span></div>
        <p style={{ margin: '18px 0', color: 'var(--text-2)' }}><strong style={{ color: 'var(--text)' }}>Problem. </strong>{c.problem}</p>
        <p style={{ color: 'var(--text-2)' }}>{c.description}</p>
        <ol className="cs-steps">
          {DEMO_STEP_TEXT.map((st) => {
            const inCase = c.stages.includes(st.stage)
            return (
              <li key={st.key} className={inCase ? '' : 'is-off'}>
                <b>{st.title} <small className="mono">{st.stage}</small></b>
                <p>{inCase ? st.text : 'Not part of this scenario.'}</p>
              </li>
            )
          })}
          <li><b>Result</b><p>{DEMO_OUTCOME[c.id]?.result ?? 'No outcome text is defined for this scenario.'}</p></li>
          <li><b>Limitations</b><p>{DEMO_OUTCOME[c.id]?.limitations ?? 'No limitation text is defined for this scenario.'}</p></li>
        </ol>
        <div className="note" style={{ marginTop: 22 }}>
          <span><CanonStatus s="demo" /> This is an illustrative scenario for presentation. It is not a record from the backend, and it shows no satellite imagery, coordinates, scores or vessels. Real investigations are listed under History.</span>
        </div>
        <div style={{ marginTop: 18 }}><Link to="/history" className="btn btn--sm">Go to real investigations (History) <ArrowRight size={14} /></Link></div>
      </div>
    </div>
  )
}

export default function CaseStudiesPage() {
  useDocumentTitle('Case Studies')
  const [cat, setCat] = useState<'All' | CaseCategory>('All')
  const [open, setOpen] = useState<CaseStudy | null>(null)
  const list = CASE_STUDIES.filter((c) => cat === 'All' || c.category === cat)

  return (
    <div className="inner">
      <header className="page-head">
        <span className="eyebrow">Case studies</span>
        <h1>Scenarios in action</h1>
        <p>Illustrative cases showing how Varuna Netra approaches different maritime situations. Every card here is a <span className="badge-demo">DEMO CASE</span>. Real records live under <Link to="/history" style={{ color: 'var(--primary)' }}>History</Link>.</p>
      </header>
      <div className="filters" role="group" aria-label="Filter by category">
        {CATS.map((c) => <button key={c} className="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>)}
      </div>
      <div className="grid-3">
        {list.map((c, i) => (
          <article className="card case" key={c.id}>
            <div className="case__art" role="img" aria-label="Decorative illustration, not satellite imagery"><CaseArt hue={c.hue} seed={CASE_STUDIES.indexOf(c) + i} /><span className="case__cat badge-demo">DEMO CASE</span></div>
            <div className="case__body">
              <span className="eyebrow" style={{ fontSize: 11 }}>{c.category}</span>
              <h3>{c.title}</h3>
              <div className="case__meta"><span>{c.region}</span><span>{c.investigationType}</span></div>
              <p>{c.problem}</p>
              <div className="case__foot">
                <div className="stagechips">{c.stages.map((s) => <span key={s}>{s}</span>)}</div>
                <button className="btn btn--sm" onClick={() => setOpen(c)}>Explore case <ArrowRight size={14} /></button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {open && <CaseModal c={open} onClose={() => setOpen(null)} />}
    </div>
  )
}
