import type { Metadata } from 'next'

import { AdminsPage } from '@/components/dashboard/AdminsPage'

export const metadata: Metadata = { title: 'Admins' }

export default function Page() {
  return <AdminsPage />
}
