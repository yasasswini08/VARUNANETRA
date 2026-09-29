import type { ElementType, ReactNode } from 'react'
import { useReveal } from '../hooks/useReveal'

export function Reveal({ children, as: Tag = 'div', delay, className = '' }: { children: ReactNode; as?: ElementType; delay?: 1 | 2 | 3; className?: string }) {
  const ref = useReveal<HTMLElement>()
  return <Tag ref={ref} data-delay={delay} className={`reveal ${className}`}>{children}</Tag>
}
