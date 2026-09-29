import { PIPELINE } from '../data/pipeline'

/** Hero pipeline strip: architectural overview only, not backend state. */
export function PipelineStrip() {
  return (
    <ol className="strip" aria-label="Varuna Netra M1 to M6 pipeline">
      {PIPELINE.map((s) => (
        <li key={s.id} className="strip__step">
          <span className="strip__badge">{s.id}</span>
          <h3>{s.title}</h3>
          <p>{s.short}</p>
        </li>
      ))}
    </ol>
  )
}
