import { ExternalLink } from 'lucide-react'
import { ARCHITECTURE, DATA_RESOURCES, NOT_CONNECTED, PROCESSING, SYSTEM_LAYERS } from '../data/resources'
import { Reveal } from '../components/Reveal'
import { Pill } from '../components/StatusPill'
import { useProviders } from '../hooks/useMissionData'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

export default function DataResourcesPage() {
  useDocumentTitle('System & Data Resources')
  const providers = useProviders()

  const statusFor = (name?: string) => {
    if (!name) return null
    if (providers.status === 'loading') return <Pill tone="active">Checking</Pill>
    if (providers.status === 'error') return <Pill tone="muted">Status unavailable</Pill>
    const p = providers.data.providers.find((x) => x.name === name)
    if (!p) return <Pill tone="muted">Not reported</Pill>
    return p.configured ? <Pill tone="ok">Configured</Pill> : <Pill tone="warn">Not configured</Pill>
  }

  return (
    <div className="inner">
      <header className="page-head">
        <span className="eyebrow">System &amp; data resources</span>
        <h1>The data ecosystem</h1>
        <p>The sources, models and services behind Varuna Netra. Provider badges reflect whether credentials are configured on the backend, and are not a live availability check.</p>
      </header>

      <section aria-labelledby="dr-arch">
        <h2 id="dr-arch" style={{ fontSize: 30, marginBottom: 16 }}>System architecture</h2>
        <ol className="flow" aria-label="Data flow from sources to report">
          {ARCHITECTURE.map((n, i) => <li key={n.id} className="flow__n"><span className="mono">{String(i + 1).padStart(2, '0')}</span><b>{n.title}</b><small>{n.note}</small></li>)}
        </ol>
        <p className="hint" style={{ marginTop: 10 }}>Explanatory diagram. A stage works in a given deployment only if its provider credentials are configured; see the badges below.</p>
      </section>

      <section className="block" aria-labelledby="dr-src">
        <h2 id="dr-src">Data resources</h2>
        <p className="lede">Multi-source satellite, vessel and environmental data.</p>
        <div className="res">
          {DATA_RESOURCES.map((d) => (
            <Reveal key={d.key} className="card res__card">
              <div className="res__top">
                <div><h3>{d.title}</h3><small>{d.org}</small></div>
                {statusFor(d.providerName)}
              </div>
              <p>{d.role}</p>
              <dl className="res__meta"><div><dt>Data type</dt><dd>{d.dataType}</dd></div><div><dt>Role in pipeline</dt><dd>{d.pipelineRole}</dd></div><div><dt>Provenance</dt><dd>{d.provenance}</dd></div></dl>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{d.tags.map((t) => <span className="tag" key={t}>{t}</span>)}</div>
                <a className="link-more" href={d.url} target="_blank" rel="noreferrer noopener">Visit <ExternalLink size={13} /><span className="sr-only"> (opens in new tab)</span></a>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="block" aria-labelledby="dr-proc">
        <h2 id="dr-proc">Processing</h2>
        <p className="lede">Backend modules and the routes that expose them.</p>
        <div className="res">
          {PROCESSING.map((m) => (
            <Reveal key={m.code} className="card res__card">
              <div className="res__top"><div><h3>{m.title}</h3><small className="mono">{m.endpoint}</small></div><Pill tone="muted" flat>{m.code}</Pill></div>
              <p>{m.role}</p>
            </Reveal>
          ))}
        </div>
        <h3 style={{ fontSize: 20, margin: '26px 0 10px' }}>Not connected in this build</h3>
        <ul className="nc">{NOT_CONNECTED.map((x) => <li key={x.title}><b>{x.title}</b><span>{x.why}</span></li>)}</ul>
      </section>

      <section className="block" aria-labelledby="dr-layers">
        <h2 id="dr-layers">Platform layers</h2>
        <div className="layers" style={{ marginTop: 20 }}>
          {SYSTEM_LAYERS.map((l) => (
            <Reveal key={l.title} className="principle">
              <h3>{l.title}</h3><p>{l.body}</p>
              <div className="pipe__inputs">{l.items.map((x) => <span className="tag" key={x}>{x}</span>)}</div>
            </Reveal>
          ))}
        </div>
      </section>
    </div>
  )
}
