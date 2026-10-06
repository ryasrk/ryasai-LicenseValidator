'use client'

import { useCallback, useState } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'lm_theme'

/**
 * Current theme and a toggle. The initial theme (saved choice, else the system
 * preference) is applied to <html> by the inline script in app/layout.tsx.
 */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  )

  const toggle = useCallback(() => {
    const next: Theme = document.documentElement.classList.contains('dark') ? 'light' : 'dark'
    document.documentElement.classList.toggle('dark', next === 'dark')
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Storage unavailable: the choice just won't persist
    }
    setTheme(next)
  }, [])

  return [theme, toggle]
}
