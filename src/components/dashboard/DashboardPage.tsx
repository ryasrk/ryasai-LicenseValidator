'use client'

import { useEffect, useState } from 'react'

import { admin, unwrap, type License, type Stats } from '@/lib/api'
import { useReveal } from '@/lib/motion'
import { Icons, PlanBadge, StatCard, StatusBadge } from './ui'

// Dashboard Page
export function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [recentLicenses, setRecentLicenses] = useState<License[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      unwrap(admin.stats.get()).then(setStats),
      unwrap(admin.licenses.get({ query: { per_page: 5 } })).then(d => setRecentLicenses(d.data || [])),
    ]).finally(() => setLoading(false))
  }, [])

  const activeRate = stats && stats.total_licenses > 0
    ? Math.round((stats.active_licenses / stats.total_licenses) * 100) + '%'
    : '-'

  const revealRef = useReveal<HTMLDivElement>([loading, recentLicenses])

  return (
    <div ref={revealRef}>
      <div data-reveal className="flex flex-wrap items-center justify-between gap-3 mb-6 md:mb-8">
        <div>
          <h2 className="text-xl font-bold text-ink tracking-tight">Dashboard</h2>
          <p className="text-sm text-ink-subtle mt-0.5">License system overview</p>
        </div>
        <div className="text-xs text-ink-subtle bg-surface-2 px-3 py-1.5 rounded-full border border-hairline">
          Last updated: {new Date().toLocaleTimeString()}
        </div>
      </div>

      {/* Stats */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
          {[1,2,3,4].map(i => (
            <div key={i} className="bg-surface-1 rounded-xl border border-hairline p-5 h-24 animate-pulse">
              <div className="h-3 bg-surface-3 rounded w-20 mb-3"></div>
              <div className="h-6 bg-surface-3 rounded w-12"></div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
          <StatCard label="Total Licenses" value={stats?.total_licenses || 0} color="blue"
            icon={<Icons.Key />} />
          <StatCard label="Active" value={stats?.active_licenses || 0} color="green"
            icon={<Icons.Check />} subtitle={`${activeRate} active rate`} />
          <StatCard label="Validations Today" value={stats?.total_validations_today || 0} color="purple"
            icon={<Icons.Activity />} />
          <StatCard label="Machines" value={stats?.total_machines || 0} color="orange"
            icon={<Icons.Monitor />} />
        </div>
      )}

      {/* Recent Licenses */}
      <div data-reveal className="bg-surface-1 rounded-xl border border-hairline">
        <div className="px-4 sm:px-6 py-4 border-b border-hairline flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">Recent Licenses</h3>
          <span className="text-xs text-ink-subtle">{recentLicenses.length} shown</span>
        </div>
        <div className="divide-y divide-hairline">
          {recentLicenses.map(lic => (
            <div key={lic.id} data-reveal className="px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 table-row-hover hover:bg-surface-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-full bg-brand-50 text-brand-500 dark:text-brand-300 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                  {lic.customer_name?.[0]?.toUpperCase() || '?'}
                </div>
                <div>
                  <p className="text-sm font-medium text-ink">{lic.customer_name}</p>
                  <p className="text-xs text-ink-subtle">{lic.customer_email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {lic.product && <span className="text-[10px] font-mono bg-gray-100 dark:bg-surface-3 text-ink-muted px-1.5 py-0.5 rounded">{lic.product}</span>}
                <PlanBadge plan={lic.plan} />
                <StatusBadge active={lic.is_active} />
              </div>
            </div>
          ))}
          {recentLicenses.length === 0 && (
            <div className="px-6 py-12 text-center">
              <div className="w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center mx-auto mb-3">
                <Icons.Key />
              </div>
              <p className="text-sm text-ink-subtle">No licenses yet</p>
              <p className="text-xs text-ink-tertiary mt-1">Create your first license to get started</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
