import { Check, Lock, X } from 'lucide-react'

export type StepState = 'todo' | 'active' | 'done' | 'warn' | 'failed' | 'future'
export interface Step { label: string; state: StepState; note?: string }

export function StepTrack({ steps, label }: { steps: Step[]; label: string }) {
  return (
    <ol className="steps" aria-label={label}>
      {steps.map((s, i) => (
        <li key={s.label} className={`step step--${s.state}`} aria-current={s.state === 'active' ? 'step' : undefined}>
          <span className="step__dot" aria-hidden="true">
            {s.state === 'done' ? <Check size={14} /> : s.state === 'failed' ? <X size={14} /> : s.state === 'future' ? <Lock size={12} /> : i + 1}
          </span>
          <span className="step__label">{s.label}</span>
          <span className="step__note">{s.note ?? (s.state === 'future' ? 'Phase 3' : s.state === 'done' ? 'Complete' : s.state === 'active' ? 'In progress' : s.state === 'failed' ? 'Failed' : s.state === 'warn' ? 'Needs review' : 'Pending')}</span>
        </li>
      ))}
    </ol>
  )
}
