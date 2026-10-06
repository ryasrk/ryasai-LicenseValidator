'use client'

import dynamic from 'next/dynamic'
import type { ReactNode } from 'react'

// The admin shell reads the admin token from localStorage on first render, so it is client-only
const App = dynamic(() => import('./App'), { ssr: false })

export default function AdminLoader({ children }: { children: ReactNode }) {
  return <App>{children}</App>
}
