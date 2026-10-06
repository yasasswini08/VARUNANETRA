import { Link } from 'react-router-dom'
import { ArrowRight, Eye, FlaskConical, Layers, Route, ScrollText, ShieldCheck, Waves } from 'lucide-react'
import { PipelineStrip } from '../components/PipelineStrip'
import { Reveal } from '../components/Reveal'
import { Pill } from '../components/StatusPill'
import { CaseArt } from '../components/CaseArt'
import { PIPELINE } from '../data/pipeline'
import { DATA_RESOURCES } from '../data/resources'
import { CASE_STUDIES } from '../data/caseStudies'
import { TEAM } from '../config/site'
import { useHealth } from '../hooks/useMissionData'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

function HeroSignal() {
  const h = useHealth()
  return (
    <aside className="signal" aria-label="Backend status">
      <h3>System signal</h3>
      <dl>
        <dt>API</dt>
        <dd>
          {h.status === 'loading' && <Pill tone="active">Checking</Pill>}
          {h.status === 'success' && <Pill tone="ok">Operational</Pill>}
          {h.status === 'error' && <Pill tone="err">Unavailable</Pill>}
        </dd>
        {h.status === 'success' && (<><dt>Mode</dt><dd>{h.data.app_mode}</dd><dt>Model</dt><dd>{h.data.model_version}</dd></>)}
      </dl>
    </aside>
  )
}

const PROJECT_LINKS = [
  { key: 'prototype', title: 'Live Prototype', body: 'The deployed frontend on Vercel.', href: 'https://varunanetra-six.vercel.app/' },
  { key: 'backend', title: 'Backend API', body: 'FastAPI backend running on Hugging Face Spaces.', href: 'https://huggingface.co/spaces/balapraharsham/varuna-netra-api' },
  { key: 'github', title: 'GitHub Repository', body: 'Full source code: backend, frontend, tests and docs.', href: 'https://github.com/yasasswini08/VARUNANETRA' },
  { key: 'demo', title: 'Demo Video', body: 'Watch the walkthrough on YouTube.', href: 'https://youtu.be/RfGGjFFiubQ' },
]

const CAPS = [
  { icon: Eye, title: 'Slick detection', body: 'CFAR-based segmentation on calibrated, speckle-filtered Sentinel-1 backscatter with land masking.' },
  { icon: Waves, title: 'Drift reconstruction', body: 'Backward and forward Lagrangian ensembles forced by CMEMS currents and ERA5 wind.' },
  { icon: Route, title: 'Vessel correlation', body: 'AIS trajectories matched to the origin region, with gaps and loitering treated as supporting evidence only.' },
  { icon: FlaskConical, title: 'Counterfactual testing', body: 'PASHA replays each vessel hypothesis and asks whether it could explain what the satellite saw.' },
  { icon: ShieldCheck, title: 'Falsification & plausibility', body: 'Physical-plausibility and falsification checks guard against over-confident attribution.' },
  { icon: ScrollText, title: 'Evidence provenance', body: 'Every input carries provenance so the final dossier can be audited end to end.' },
]

export default function LandingPage() {
  useDocumentTitle('Ocean Intelligence Platform')
  return (
    <>
      <section className="hero">
        <div className="hero__bg" aria-hidden="true" />
        <svg className="hero__radar" viewBox="0 0 200 200" aria-hidden="true">
          <defs>
            <linearGradient id="sw" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#3fd8e8" stopOpacity="0" /><stop offset="1" stopColor="#3fd8e8" stopOpacity=".35" /></linearGradient>
          </defs>
          {[95, 68, 42, 18].map((r) => <circle key={r} className="ring" cx="100" cy="100" r={r} />)}
          <path d="M100 5v190M5 100h190" stroke="rgba(63,216,232,.12)" />
          <g className="sweep"><path d="M100 100 L195 100 A95 95 0 0 0 167 33Z" fill="url(#sw)" /></g>
        </svg>
        <HeroSignal />
        <div className="hero__inner">
          <div className="hero__kicker"><span>Satellite data</span><span>Ocean physics</span><span>Evidence-based analysis</span></div>
          <h1>
            <span className="line"><span>Seeing the <em>Ocean.</em></span></span>
            <span className="line"><span>Finding the <em>Truth.</em></span></span>
          </h1>
          <p className="hero__lede">
            Varuna Netra combines satellite observations with physics-based drift models to detect oil spills, reconstruct where they came from, correlate vessel activity and assemble verifiable evidence.
          </p>
          <div className="hero__actions">
            <Link to="/app" className="btn btn--primary">Enter Mission Control <ArrowRight size={17} /></Link>
            <a href="#how-it-works" className="btn">Explore the System</a>
          </div>
          <ol className="hero__verbs" aria-label="What Varuna Netra does">
            {['Observe', 'Investigate', 'Reconstruct', 'Correlate', 'Challenge', 'Report'].map((v) => <li key={v}>{v}</li>)}
          </ol>
        </div>
        <PipelineStrip />
      </section>

      <section className="section" aria-labelledby="problem">
        <div className="section__inner split">
          <Reveal>
            <span className="eyebrow">The problem</span>
            <h2 id="problem" style={{ marginTop: 14 }}>A slick is easy to see. Its source is not.</h2>
            <p className="lede">Oil discharged at sea drifts, spreads and weathers within hours. By the time it is noticed, the responsible vessel may be hundreds of kilometres away and the evidence trail has thinned.</p>
          </Reveal>
          <Reveal delay={1} className="compare">
            <div className="compare__row"><h3>Observation</h3><p>Satellite radar reveals where a slick is, but not where it started.</p></div>
            <div className="compare__row"><h3>Attribution</h3><p>Linking a slick to a vessel needs ocean physics, timing and tracks, and must survive scrutiny.</p></div>
            <div className="compare__row"><h3>Evidence</h3><p>Authorities need reproducible, provenance-tracked findings rather than a plausible story.</p></div>
          </Reveal>
        </div>
      </section>

      <section className="section section--alt" id="how-it-works" aria-labelledby="how">
        <div className="section__inner">
          <Reveal>
            <span className="eyebrow">How Varuna Netra works</span>
            <h2 id="how" style={{ marginTop: 14 }}>Six stages from pixels to evidence.</h2>
            <p className="lede">Each stage feeds the next. The chain ends not with a guess but with a counterfactual test: could this vessel have produced what we observed?</p>
          </Reveal>
          <div className="pipe">
            {PIPELINE.map((s, i) => (
              <Reveal key={s.id} delay={(((i % 3) + 1) as 1 | 2 | 3)} className="pipe__card">
                <span className="pipe__num">{s.id}</span>
                <h3>{s.title}</h3>
                <p>{s.detail}</p>
                <div className="pipe__inputs">{s.inputs.map((x) => <span className="tag" key={x}>{x}</span>)}</div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="data">
        <div className="section__inner">
          <Reveal>
            <span className="eyebrow">Data sources</span>
            <h2 id="data" style={{ marginTop: 14 }}>Open data, traceable end to end.</h2>
          </Reveal>
          <div className="sources">
            {DATA_RESOURCES.map((d, i) => (
              <Reveal key={d.key} delay={(((i % 3) + 1) as 1 | 2 | 3)} className="source">
                <h3>{d.title}</h3><small>{d.org}</small><p>{d.role}</p>
              </Reveal>
            ))}
          </div>
          <Reveal><Link to="/data-resources" className="link-more" style={{ marginTop: 22 }}>System &amp; data resources <ArrowRight size={14} /></Link></Reveal>
        </div>
      </section>

      <section className="section section--alt" aria-labelledby="caps">
        <div className="section__inner">
          <Reveal>
            <span className="eyebrow">Capabilities</span>
            <h2 id="caps" style={{ marginTop: 14 }}>Built to be challenged.</h2>
            <p className="lede">Intelligence that cannot be questioned is not evidence. Every conclusion is designed to be tested, bounded and explained.</p>
          </Reveal>
          <Reveal className="caps">
            {CAPS.map((c) => { const I = c.icon; return <div className="cap" key={c.title}><I aria-hidden="true" /><h3>{c.title}</h3><p>{c.body}</p></div> })}
          </Reveal>
        </div>
      </section>

      <section className="section" aria-labelledby="cases">
        <div className="section__inner">
          <Reveal className="mc-head">
            <div>
              <span className="eyebrow">Case studies</span>
              <h2 id="cases" style={{ marginTop: 14 }}>Scenarios the platform is built for.</h2>
            </div>
            <Link to="/case-studies" className="link-more">All case studies <ArrowRight size={14} /></Link>
          </Reveal>
          <div className="grid-3" style={{ marginTop: 40 }}>
            {CASE_STUDIES.slice(0, 3).map((c, i) => (
              <Reveal key={c.id} delay={((i + 1) as 1 | 2 | 3)} className="card case">
                <div className="case__art"><CaseArt hue={c.hue} seed={i + 1} /><span className="case__cat badge-demo">DEMO CASE</span></div>
                <div className="case__body"><h3>{c.title}</h3><div className="case__meta"><span>{c.region}</span><span>{c.investigationType}</span></div><p>{c.problem}</p></div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {TEAM.length > 0 && (
        <section className="section section--alt" aria-labelledby="team">
          <div className="section__inner">
            <Reveal><span className="eyebrow">Project team</span><h2 id="team" style={{ marginTop: 14 }}>The people behind it.</h2></Reveal>
            <div className="team" style={{ marginTop: 40 }}>
              {TEAM.map((m) => <div className="card member" key={m.name}><h3>{m.name}</h3><small>{m.role}</small>{m.bio && <p>{m.bio}</p>}</div>)}
            </div>
          </div>
        </section>
      )}

      <section className="section" aria-labelledby="links">
        <div className="section__inner">
          <Reveal>
            <span className="eyebrow">Project links</span>
            <h2 id="links" style={{ marginTop: 14 }}>Prototype, backend, code and demo.</h2>
          </Reveal>
          <div className="sources">
            {PROJECT_LINKS.map((l, i) => (
              <Reveal key={l.key} delay={(((i % 3) + 1) as 1 | 2 | 3)} className="source">
                <h3>{l.title}</h3>
                <p>{l.body}</p>
                <a href={l.href} target="_blank" rel="noopener noreferrer" className="link-more" style={{ marginTop: 12 }}>
                  Open <ArrowRight size={14} />
                </a>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="cta-final" aria-labelledby="cta">
        <Layers size={28} style={{ color: 'var(--primary)', margin: '0 auto 22px' }} aria-hidden="true" />
        <h2 id="cta">Open the control room.</h2>
        <div className="hero__actions">
          <Link to="/app" className="btn btn--primary">Enter Mission Control <ArrowRight size={17} /></Link>
          <Link to="/project" className="btn">Read the project overview</Link>
        </div>
      </section>
    </>
  )
}
