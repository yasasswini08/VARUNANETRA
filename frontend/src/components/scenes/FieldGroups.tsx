import type { FieldGroup } from '../../lib/scene'

export function FieldGroups({ groups }: { groups: FieldGroup[] }) {
  return (
    <div className="fgroups">
      {groups.map((g) => (
        <section key={g.title} className="fgroup" aria-label={g.title}>
          <h3>{g.title}</h3>
          <dl className="fields">
            {g.fields.map((f) => <div key={f.label} className="fields__row"><dt>{f.label}</dt><dd className="mono">{f.value}</dd></div>)}
          </dl>
        </section>
      ))}
    </div>
  )
}
