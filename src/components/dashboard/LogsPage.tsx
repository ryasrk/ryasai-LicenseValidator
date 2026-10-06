'use client'

import { useCallback, useEffect, useState } from 'react'

import { admin, unwrap, type ValidationLog } from '@/lib/api'
import { useReveal } from '@/lib/motion'
import { Icons, Spinner } from './ui'

const resultStyles: Record<string, { bg: string; dot: string }> = {
  valid: { bg: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/25', dot: 'bg-emerald-500' },
  invalid: { bg: 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/25', dot: 'bg-red-500' },
  expired: { bg: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/25', dot: 'bg-amber-500' },
  machine_limit: { bg: 'bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-500/25', dot: 'bg-violet-500' },
  inactive: { bg: 'bg-surface-3 text-ink-muted border-hairline', dot: 'bg-gray-400' },
  wrong_product: { bg: 'bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-500/25', dot: 'bg-orange-500' },
}

// Validation Logs Page — auto-refresh, better result badges
export function LogsPage() {
  const [logs, setLogs] = useState<ValidationLog[]>([])
  const [loading, setLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(false)

  const fetchLogs = useCallback(() => {
    return unwrap(admin['validation-logs'].get({ query: { limit: 50 } }))
      .then(setLogs)
      .catch(() => setLogs([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchLogs() }, [])

  // Auto-refresh every 10s
  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(fetchLogs, 10000)
    return () => clearInterval(interval)
  }, [autoRefresh, fetchLogs])

  const validCount = logs.filter(l => l.result === 'valid').length
  const failCount = logs.filter(l => l.result !== 'valid').length

  const revealRef = useReveal<HTMLDivElement>([logs])

  return (
    <div ref={revealRef}>
      <div data-reveal className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-xl font-bold text-ink tracking-tight">Validation Logs</h2>
          <p className="text-sm text-ink-subtle mt-0.5">
            {logs.length} entries
            {logs.length > 0 && <span className="ml-2 text-ink-tertiary">({validCount} valid, {failCount} failed)</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-ink-subtle cursor-pointer select-none">
            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)}
              className="rounded border-hairline text-brand-500 focus:ring-brand-500/20" />
            Auto-refresh
            {autoRefresh && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 pulse-dot"></span>}
          </label>
          <button onClick={fetchLogs} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-ink-muted hover:bg-surface-2 rounded-md border border-hairline transition-colors">
            <Icons.Refresh /> Refresh
          </button>
        </div>
      </div>

      <div data-reveal className="bg-surface-1 rounded-xl border border-hairline overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-surface-2 border-b border-hairline">
            <tr className="text-left text-ink-subtle text-xs font-medium uppercase tracking-wider">
              <th className="px-5 py-3">Time</th>
              <th className="px-5 py-3">License Key</th>
              <th className="px-5 py-3">Machine ID</th>
              <th className="px-5 py-3">Result</th>
              <th className="px-5 py-3">IP Address</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {logs.map((log, i) => {
              const style = resultStyles[log.result] || resultStyles.inactive
              return (
                <tr key={log.id} data-reveal className="table-row-hover hover:bg-surface-0">
                  <td className="px-5 py-3 text-xs text-ink-muted whitespace-nowrap">{log.timestamp ? new Date(log.timestamp).toLocaleString() : '-'}</td>
                  <td className="px-5 py-3"><code className="text-xs font-mono text-ink-muted bg-surface-2 px-1.5 py-0.5 rounded">{log.license_key?.substring(0, 16)}...</code></td>
                  <td className="px-5 py-3"><code className="text-xs font-mono text-ink-subtle">{log.machine_id?.substring(0, 14)}...</code></td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold border ${style.bg}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`}></span>
                      {log.result?.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-ink-subtle font-mono">{log.ip_address || '-'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {loading && (
          <div className="py-12 flex items-center justify-center">
            <Spinner size="w-5 h-5" color="text-brand-500" />
          </div>
        )}
        {!loading && logs.length === 0 && (
          <div className="py-12 text-center">
            <div className="w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center mx-auto mb-3 text-ink-subtle">
              <Icons.Activity />
            </div>
            <p className="text-sm text-ink-subtle">No validation logs yet</p>
            <p className="text-xs text-ink-tertiary mt-1">Logs appear when clients validate licenses</p>
          </div>
        )}
      </div>
    </div>
  )
}
