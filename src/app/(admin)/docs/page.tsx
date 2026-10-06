import type { Metadata } from 'next'

import { DocsPage } from '@/components/dashboard/DocsPage'

export const metadata: Metadata = { title: 'API Docs' }

export default function Page() {
  return <DocsPage />
}
