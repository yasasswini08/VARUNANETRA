import { Link } from 'react-router-dom'
import { ArrowRight, Droplets, FlaskConical, Globe, Leaf, Network, ScrollText, ShieldCheck, Ship } from 'lucide-react'
import { PIPELINE } from '../data/pipeline'
import { Reveal } from '../components/Reveal'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

const HIGHLIGHTS = [
  { icon: Droplets, title: 'SAR detection', body: 'Finds slick candidates in Sentinel-1 radar imagery, day or night.' },
  { icon: Ship, title: 'Vessel attribution', body: 'Correlates AIS tracks with the reconstructed origin.' },
  { icon: FlaskConical, title: 'Counterfactual analysis', body: 'PASHA tests whether a vessel could have caused the observed slick.' },
  { icon: Globe, title: 'Open data', body: 'Built on Sentinel-1, ERA5, CMEMS and Global Fishing Watch.' },
  { icon: ScrollText, title: 'Evidence dossiers', body: 'Reports carry provenance for every input.' },
  { icon: Leaf, title: 'Environmental impact', body: 'Supports faster response and stronger enforcement.' },
]

const WHY_HARD = [
  { t: 'Time', b: 'Slicks spread, weather and fragment within hours of release.' },
  { t: 'Distance', b: 'The source vessel is usually far from the slick by the time it is imaged.' },
  { t: 'Ambiguity', b: 'Look-alikes such as low-wind areas and natural seeps mimic slicks in SAR.' },
  { t: 'Sparse tracks', b: 'AIS gaps and spoofing weaken purely track-based attribution.' },
]

const PRINCIPLES = [
  { t: 'Lagrangian drift', b: 'The slick is a cloud of particles advected by currents and wind, run backward and forward as ensembles to express uncertainty.' },
  { t: 'Counterfactual reasoning', b: 'Instead of asking whether a vessel was nearby, PASHA asks what the satellite would have seen if that vessel had released oil, and compares it to what was seen.' },
  { t: 'Falsification first', b: 'Hypotheses are actively challenged. A vessel that cannot physically explain the slick is excluded.' },
  { t: 'Evidence provenance', b: 'Every dataset, model version and parameter is recorded so a finding can be audited and reproduced.' },
]

const STACK = [
  { t: 'Interface', v: ['React', 'TypeScript', 'Vite'] },
  { t: 'Service', v: ['FastAPI', 'Celery', 'Redis'] },
  { t: 'Data', v: ['PostgreSQL', 'PostGIS', 'xarray'] },
  { t: 'Modelling', v: ['OpenDrift', 'NumPy / SciPy', 'PyTorch'] },
  { t: 'Geospatial', v: ['Rasterio', 'GeoPandas', 'Shapely'] },
  { t: 'Reporting', v: ['Jinja2', 'WeasyPrint'] },
]

export default function ProjectPage() {
  useDocumentTitle('Project Overview')
  return (
    <div className="inner">
      <header className="page-head">
        <span className="eyebrow">Project overview</span>
        <h1>What is Varuna Netra?</h1>
        <p>A physics-constrained platform that turns satellite observations of oil slicks into testable, evidence-backed statements about where they came from.</p>
      </header>

      <div className="hl-grid">
        {HIGHLIGHTS.map((h, i) => { const I = h.icon; return (
          <Reveal key={h.title} delay={(((i % 3) + 1) as 1 | 2 | 3)} className="hl"><I aria-hidden="true" /><h3>{h.title}</h3><p>{h.body}</p></Reveal>
        ) })}
      </div>

      <section className="block" aria-labelledby="p-problem">
        <Reveal><h2 id="p-problem">Why attribution is difficult</h2><p className="lede">Conventional surveillance detects slicks but rarely proves who caused them.</p></Reveal>
        <div className="grid-2" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
          {WHY_HARD.map((w) => <Reveal key={w.t} className="hl"><h3>{w.t}</h3><p>{w.b}</p></Reveal>)}
        </div>
      </section>

      <section className="block" aria-labelledby="p-solution">
        <Reveal><h2 id="p-solution">Our approach</h2><p className="lede">Detect, reconstruct, correlate, test and explain.</p></Reveal>
        <Reveal className="flow">
          {[['Detect', 'Locate the slick in SAR imagery.'], ['Reconstruct', 'Drift it backward to candidate origins.'], ['Attribute', 'Correlate vessels and test each with PASHA.'], ['Explain', 'Compile an auditable evidence dossier.']].map(([t, b]) => (
            <div className="flow__step" key={t}><h3>{t}</h3><p>{b}</p></div>
          ))}
        </Reveal>
      </section>

      <section className="block" aria-labelledby="p-arch">
        <Reveal><h2 id="p-arch">Architecture: M1 to M6</h2><p className="lede">An architectural overview. Investigation workflows are delivered in later phases.</p></Reveal>
        <div className="arch">
          {PIPELINE.map((s) => (
            <Reveal key={s.id} className="arch__col"><b>{s.id}</b><h3>{s.title}</h3><p>{s.short}</p></Reveal>
          ))}
        </div>
      </section>

      <section className="block" aria-labelledby="p-sci">
        <Reveal><h2 id="p-sci">Scientific principles</h2></Reveal>
        <div className="principles" style={{ marginTop: 20 }}>
          {PRINCIPLES.map((p) => <Reveal key={p.t} className="principle"><h3>{p.t}</h3><p>{p.b}</p></Reveal>)}
        </div>
      </section>

      <section className="block" aria-labelledby="p-tech">
        <Reveal><h2 id="p-tech">Technology stack</h2></Reveal>
        <div className="stack" style={{ marginTop: 20 }}>
          {STACK.map((s) => <Reveal key={s.t} className="stack__item"><h3>{s.t}</h3><div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{s.v.map((x) => <span className="tag" key={x}>{x}</span>)}</div></Reveal>)}
        </div>
      </section>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 56 }}>
        <Link to="/case-studies" className="btn btn--primary"><ShieldCheck size={16} /> View case studies</Link>
        <Link to="/data-resources" className="btn"><Network size={16} /> System &amp; data resources <ArrowRight size={15} /></Link>
      </div>
    </div>
  )
}
