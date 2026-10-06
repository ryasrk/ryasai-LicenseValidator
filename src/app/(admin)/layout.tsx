import type { ReactNode } from 'react'

import AdminLoader from '@/components/dashboard/AdminLoader'

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminLoader>{children}</AdminLoader>
}
