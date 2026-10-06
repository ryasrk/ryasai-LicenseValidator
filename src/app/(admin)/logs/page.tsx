import type { Metadata } from 'next'

import { LogsPage } from '@/components/dashboard/LogsPage'

export const metadata: Metadata = { title: 'Validation Logs' }

export default function Page() {
  return <LogsPage />
}
