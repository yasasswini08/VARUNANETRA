import { useEffect } from 'react'
export function useDocumentTitle(title: string) {
  useEffect(() => { document.title = `${title} — Varuna Netra` }, [title])
}
