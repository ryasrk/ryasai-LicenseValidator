import type { Metadata } from 'next'

import { LicensesPage } from '@/components/dashboard/LicensesPage'

export const metadata: Metadata = { title: 'Licenses' }

export default function Page() {
  return <LicensesPage />
}
