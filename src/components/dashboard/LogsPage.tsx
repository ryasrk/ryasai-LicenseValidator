'use client'

import { useCallback, useEffect, useState } from 'react'

import { admin, loadMeta, unwrap, type ValidationLog } from '@/lib/api'
import { dayBoundary, formatDateTime } from '@/lib/dates'
import { useReveal } from '@/lib/motion'
import { Icons, Select, Spinner, Switch, type SelectOption } from './ui'

const resultStyles: Record<string, { bg: string; dot: string }> = {
  valid: { bg: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/25', dot: 'bg-emerald-500' },
  invalid: { bg: 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/25', dot: 'bg-red-500' },
  expired: { bg: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/25', dot: 'bg-amber-500' },
  machine_limit: { bg: 'bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-500/25', dot: 'bg-violet-500' },
  inactive: { bg: 'bg-surface-3 text-ink-muted border-hairline', dot: 'bg-gray-400' },
  wrong_product: { bg: 'bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-500/25', dot: 'bg-orange-500' },
}

const PAGE_SIZE = 50
const ALL_RESULTS = 'all'

const filterInputClass = 'px-3 py-2 border border-hairline rounded-lg text-sm bg-surface-1 text-ink input-focus focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none placeholder:text-ink-tertiary'

// Validation Logs Page — search, result and date filters, auto-refresh
export function LogsPage() {
  const [logs, setLogs] = useState<ValidationLog[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [page, setPage] = useState(1)

  const [search, setSearch] = useState('')
  // The search the list was last asked for; follows the input after a short pause in typing
  const [query, setQuery] = useState('')
  const [result, setResult] = useState(ALL_RESULTS)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [resultOptions, setResultOptions] = useState<SelectOption[]>([{ value: ALL_RESULTS, label: 'All results' }])

  useEffect(() => {
    loadMeta()
      .then(meta => setResultOptions([
        { value: ALL_RESULTS, label: 'All results' },
        ...meta.validation_results.map(r => ({ value: r.code, label: r.name })),
      ]))
      .catch(() => {})
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim())
      setPage(1)
    }, 250)
    return () => clearTimeout(timer)
  }, [search])

  // The server filters and pages, so the total covers every match. The dates are the viewer's local days.
  const fetchLogs = useCallback(() => {
    let stale = false
    unwrap(admin['validation-logs'].get({
      query: {
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
        ...(query ? { search: query } : {}),
        ...(result !== ALL_RESULTS ? { result } : {}),
        ...(from ? { from: dayBoundary(from, 'start') } : {}),
        ...(to ? { to: dayBoundary(to, 'end') } : {}),
      },
    }))
      .then(d => {
        if (stale) return
        setLogs(d.data)
        setTotal(d.total)
      })
      .catch(() => {
        if (stale) return
        setLogs([])
        setTotal(0)
      })
      .finally(() => { if (!stale) setLoading(false) })
    return () => { stale = true }
  }, [page, query, result, from, to])

  useEffect(() => fetchLogs(), [fetchLogs])

  // Auto-refresh every 10s
  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(fetchLogs, 10000)
    return () => clearInterval(interval)
  }, [autoRefresh, fetchLogs])

  const filtered = !!query || result !== ALL_RESULTS || !!from || !!to
  const clearFilters = () => {
    setSearch('')
    setQuery('')
    setResult(ALL_RESULTS)
    setFrom('')
    setTo('')
    setPage(1)
  }

  const revealRef = useReveal<HTMLDivElement>([logs])

  return (
    <div ref={revealRef}>
      <div data-reveal className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-xl font-bold text-ink tracking-tight">Validation Logs</h2>
          <p className="text-sm text-ink-subtle mt-0.5">{total} {filtered ? 'matching' : 'total'} entries</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-ink-subtle cursor-pointer select-none">
            Auto-refresh
            <Switch checked={autoRefresh} onChange={setAutoRefresh} />
          </label>
          <button onClick={fetchLogs} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-ink-muted hover:bg-surface-2 rounded-md border border-hairline transition-colors">
            <Icons.Refresh /> Refresh
          </button>
        </div>
      </div>

      {/* Search & filters */}
      {/* Above the table, so the open result list is not covered by it */}
      <div data-reveal className="relative z-10 flex flex-wrap items-end gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle"><Icons.Search /></span>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search license key, IP, or machine ID..." aria-label="Search logs"
            className={`w-full pl-9 pr-4 ${filterInputClass}`} />
        </div>
        <Select ariaLabel="Result filter" value={result} onChange={value => { setResult(value); setPage(1) }}
          options={resultOptions} className={`w-40 text-ink-muted ${filterInputClass}`} />
        <label className="block">
          <span className="block text-[10px] font-medium text-ink-subtle uppercase tracking-wider mb-1">From</span>
          <input type="date" value={from} max={to || undefined} onChange={e => { setFrom(e.target.value); setPage(1) }}
            className={filterInputClass} />
        </label>
        <label className="block">
          <span className="block text-[10px] font-medium text-ink-subtle uppercase tracking-wider mb-1">To</span>
          <input type="date" value={to} min={from || undefined} onChange={e => { setTo(e.target.value); setPage(1) }}
            className={filterInputClass} />
        </label>
        {filtered && (
          <button onClick={clearFilters} className="flex items-center gap-1 px-3 py-2 text-xs font-medium text-ink-muted hover:bg-surface-2 rounded-lg transition-colors">
            <Icons.X /> Clear
          </button>
        )}
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
            {logs.map(log => {
              const style = resultStyles[log.result] || resultStyles.inactive
              return (
                <tr key={log.id} data-reveal className="table-row-hover hover:bg-surface-0">
                  <td className="px-5 py-3 text-xs text-ink-muted whitespace-nowrap">{formatDateTime(log.timestamp)}</td>
                  <td className="px-5 py-3"><code title={log.license_key} className="text-xs font-mono text-ink-muted bg-surface-2 px-1.5 py-0.5 rounded">{log.license_key.length > 16 ? `${log.license_key.substring(0, 16)}...` : log.license_key}</code></td>
                  <td className="px-5 py-3"><code title={log.machine_id} className="text-xs font-mono text-ink-subtle">{log.machine_id.length > 20 ? `${log.machine_id.substring(0, 20)}...` : log.machine_id}</code></td>
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
            <p className="text-sm text-ink-subtle">{filtered ? 'No matching logs' : 'No validation logs yet'}</p>
            <p className="text-xs text-ink-tertiary mt-1">{filtered ? 'Try different filters' : 'Logs appear when clients validate licenses'}</p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-ink-subtle">Showing {((page - 1) * PAGE_SIZE) + 1}-{Math.min(page * PAGE_SIZE, total)} of {total}</p>
          <div className="flex gap-1.5">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="px-3 py-1.5 border border-hairline rounded-md text-xs font-medium text-ink-muted disabled:opacity-40 hover:bg-surface-2 transition-colors">Prev</button>
            <button onClick={() => setPage(p => p + 1)} disabled={page * PAGE_SIZE >= total}
              className="px-3 py-1.5 border border-hairline rounded-md text-xs font-medium text-ink-muted disabled:opacity-40 hover:bg-surface-2 transition-colors">Next</button>
          </div>
        </div>
      )}
    </div>
  )
}
