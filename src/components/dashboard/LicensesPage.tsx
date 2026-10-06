'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'

import { admin, unwrap, type License, type LicenseDetail } from '@/lib/api'
import { useReveal } from '@/lib/motion'
import { Icons, Modal, PlanBadge, Spinner, StatusBadge } from './ui'

// Create License Form — consistent inputs
function CreateLicenseForm({ onCreated, onClose }: { onCreated: () => void; onClose: () => void }) {
  const [form, setForm] = useState<{
    customer_name: string
    customer_email: string
    plan: string
    product: string
    max_machines: number | string
    expires_at: string
    notes: string
  }>({
    customer_name: '', customer_email: '', plan: 'starter',
    product: '', max_machines: 1, expires_at: '', notes: ''
  })
  const [loading, setLoading] = useState(false)
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const handleSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault()
    setLoading(true)
    try {
      const { expires_at, notes, ...required } = form
      const result = await unwrap(admin.licenses.post({
        ...required,
        max_machines: parseInt(String(form.max_machines)),
        ...(expires_at ? { expires_at } : {}),
        ...(notes ? { notes } : {}),
      }))
      setCreatedKey(result.license_key)
      onCreated()
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setLoading(false)
    }
  }

  const copyKey = () => {
    if (!createdKey) return
    navigator.clipboard.writeText(createdKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (createdKey) {
    return (
      <div className="text-center py-2">
        <div className="w-14 h-14 bg-emerald-50 dark:bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M5 13l4 4L19 7" /></svg>
        </div>
        <h4 className="text-base font-semibold text-ink mb-1">License Created</h4>
        <p className="text-sm text-ink-subtle mb-4">Copy and share with customer</p>
        <div className="bg-ink dark:bg-surface-0 rounded-lg p-4 flex items-center justify-between gap-3">
          <code className="text-emerald-400 text-sm font-mono break-all text-left">{createdKey}</code>
          <button onClick={copyKey} className="text-ink-subtle hover:text-white flex-shrink-0 transition-colors">
            {copied ? <Icons.Check /> : <Icons.Copy />}
          </button>
        </div>
        {copied && <p className="text-xs text-emerald-500 mt-2">Copied to clipboard</p>}
        <button onClick={onClose} className="mt-5 px-4 py-2 bg-brand-500 text-white rounded-lg text-sm font-medium btn-primary">Done</button>
      </div>
    )
  }

  const inputClass = "w-full px-3 py-2 border border-hairline rounded-lg text-sm bg-surface-1 dark:bg-surface-0 input-focus focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none text-ink placeholder:text-ink-tertiary"

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1.5">Customer Name *</label>
          <input required value={form.customer_name} onChange={e => setForm({...form, customer_name: e.target.value})}
            className={inputClass} placeholder="John Doe" />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1.5">Email *</label>
          <input required type="email" value={form.customer_email} onChange={e => setForm({...form, customer_email: e.target.value})}
            className={inputClass} placeholder="john@company.com" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-muted mb-1.5">Product / App *</label>
        <select required value={form.product} onChange={e => setForm({...form, product: e.target.value})}
          className={inputClass}>
          <option value="">Select an app...</option>
          <option value="ryasai-chatbot">ryasai-chatbot (Chatbot)</option>
          <option value="ryasai-visia">ryasai-visia (Vision Analytics)</option>
          <option value="d2t">d2t (D2T — Document to Text)</option>
          <option value="peopledet">peopledet (PeopleDet)</option>
        </select>
        <p className="text-[11px] text-ink-tertiary mt-1">Must match the app's LICENSE_PRODUCT env var</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1.5">Plan</label>
          <select value={form.plan} onChange={e => setForm({...form, plan: e.target.value})}
            className={inputClass}>
            <option value="starter">Starter</option>
            <option value="pro">Pro</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1.5">Max Machines</label>
          <input type="number" min="1" max="100" value={form.max_machines} onChange={e => setForm({...form, max_machines: e.target.value})}
            className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1.5">Expires At</label>
          <input type="date" value={form.expires_at} onChange={e => setForm({...form, expires_at: e.target.value})}
            className={inputClass} />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-muted mb-1.5">Notes</label>
        <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={2}
          className={inputClass} placeholder="Optional notes..." />
      </div>
      <div className="flex justify-end gap-2.5 pt-3 border-t border-hairline">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-ink-muted hover:bg-surface-2 rounded-lg transition-colors">Cancel</button>
        <button type="submit" disabled={loading}
          className="px-4 py-2 bg-brand-500 text-white rounded-lg text-sm font-medium btn-primary disabled:opacity-50 flex items-center gap-2">
          {loading ? <><Spinner /> Creating...</> : 'Create License'}
        </button>
      </div>
    </form>
  )
}

// License Detail Modal — refined
function LicenseDetailModal({ license, open, onClose, onUpdate }: {
  license: License | null
  open: boolean
  onClose: () => void
  onUpdate: () => void
}) {
  const [detail, setDetail] = useState<LicenseDetail | null>(null)

  useEffect(() => {
    if (open && license) {
      setDetail(null)
      unwrap(admin.licenses({ license_id: license.id }).get()).then(setDetail).catch(console.error)
    }
  }, [open, license])

  const handleRevoke = async () => {
    if (!license) return
    if (!confirm('Revoke this license? Client will lose access immediately.')) return
    await unwrap(admin.licenses({ license_id: license.id }).delete())
    onUpdate()
    onClose()
  }

  const handleReactivate = async () => {
    if (!license) return
    await unwrap(admin.licenses({ license_id: license.id }).patch({ is_active: true }))
    onUpdate()
    onClose()
  }

  if (!detail) return (
    <Modal open={open} onClose={onClose} title="License Details">
      <div className="flex items-center justify-center py-8"><Spinner size="w-5 h-5" color="text-brand-500" /></div>
    </Modal>
  )

  const info: [label: string, value: ReactNode, comp?: ReactNode][] = [
    ['Customer', detail.customer_name],
    ['Email', detail.customer_email],
    ['Plan', null, <PlanBadge key="plan" plan={detail.plan} />],
    ['Status', null, <StatusBadge key="status" active={detail.is_active} />],
    ['Max Machines', detail.max_machines],
    ['Expires', detail.expires_at ? new Date(detail.expires_at).toLocaleDateString() : 'Lifetime'],
    ['Created', detail.created_at ? new Date(detail.created_at).toLocaleDateString() : '-'],
  ]

  return (
    <Modal open={open} onClose={onClose} title="License Details">
      <div className="space-y-5">
        {/* Key */}
        <div className="bg-surface-2 rounded-lg p-3 border border-hairline">
          <p className="text-[10px] font-medium text-ink-subtle uppercase tracking-wider mb-1">License Key</p>
          <div className="flex items-center gap-2">
            <code className="text-sm font-mono text-ink break-all">{detail.license_key}</code>
            <button onClick={() => navigator.clipboard.writeText(detail.license_key)} className="text-ink-subtle hover:text-brand-500 flex-shrink-0 transition-colors"><Icons.Copy /></button>
          </div>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          {info.map(([label, value, comp], i) => (
            <div key={i} className="text-sm">
              <p className="text-[10px] font-medium text-ink-subtle uppercase tracking-wider mb-0.5">{label}</p>
              {comp || <p className="font-medium text-ink">{value}</p>}
            </div>
          ))}
        </div>

        {/* Machines */}
        {detail.machines && detail.machines.length > 0 && (
          <div>
            <p className="text-[10px] font-medium text-ink-subtle uppercase tracking-wider mb-2">
              Activated Machines ({detail.machines.filter(m => m.is_active).length}/{detail.max_machines})
            </p>
            <div className="space-y-1.5">
              {detail.machines.map(m => (
                <div key={m.id} className="flex items-center justify-between bg-surface-2 rounded-lg px-3 py-2.5 border border-hairline">
                  <div>
                    <code className="text-xs font-mono text-ink-muted">{m.machine_id.substring(0, 20)}...</code>
                    <p className="text-[11px] text-ink-subtle mt-0.5">Last seen: {m.last_seen ? new Date(m.last_seen).toLocaleString() : '-'}</p>
                  </div>
                  <StatusBadge active={m.is_active} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-between pt-3 border-t border-hairline">
          {detail.is_active ? (
            <button onClick={handleRevoke} className="px-3 py-2 text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg flex items-center gap-1.5 transition-colors">
              <Icons.Trash /> Revoke
            </button>
          ) : (
            <button onClick={handleReactivate} className="px-3 py-2 text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded-lg flex items-center gap-1.5 transition-colors">
              <Icons.Check /> Reactivate
            </button>
          )}
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-ink-muted hover:bg-surface-2 rounded-lg transition-colors">Close</button>
        </div>
      </div>
    </Modal>
  )
}

// Licenses Page
export function LicensesPage() {
  const [licenses, setLicenses] = useState<License[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedLicense, setSelectedLicense] = useState<License | null>(null)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  const loadLicenses = useCallback(() => {
    const activeOnly = filter === 'active'
    unwrap(admin.licenses.get({ query: { page, per_page: 15, active_only: activeOnly } })).then(d => {
      setLicenses(d.data || [])
      setTotal(d.total || 0)
    })
  }, [page, filter])

  useEffect(() => { loadLicenses() }, [loadLicenses])

  // Client-side search filter
  const filtered = search
    ? licenses.filter(l =>
      l.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
      l.customer_email?.toLowerCase().includes(search.toLowerCase()) ||
      l.license_key?.toLowerCase().includes(search.toLowerCase())
    )
    : licenses

  const revealRef = useReveal<HTMLDivElement>([filtered])

  return (
    <div ref={revealRef}>
      <div data-reveal className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-xl font-bold text-ink tracking-tight">Licenses</h2>
          <p className="text-sm text-ink-subtle mt-0.5">{total} total licenses</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-500 text-white rounded-lg text-sm font-medium btn-primary">
          <Icons.Plus /> New License
        </button>
      </div>

      {/* Search & Filter bar */}
      <div data-reveal className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle"><Icons.Search /></span>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, email, or key..."
            className="w-full pl-9 pr-4 py-2 border border-hairline rounded-lg text-sm bg-surface-1 dark:text-ink input-focus focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none placeholder:text-ink-tertiary" />
        </div>
        <select value={filter} onChange={e => { setFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-hairline rounded-lg text-sm text-ink-muted bg-surface-1 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none">
          <option value="all">All Status</option>
          <option value="active">Active Only</option>
        </select>
      </div>

      {/* Table */}
      <div data-reveal className="bg-surface-1 rounded-xl border border-hairline overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-surface-2 border-b border-hairline">
            <tr className="text-left text-ink-subtle text-xs font-medium uppercase tracking-wider">
              <th className="px-5 py-3">Customer</th>
              <th className="px-5 py-3">License Key</th>
              <th className="px-5 py-3">Plan</th>
              <th className="px-5 py-3">Machines</th>
              <th className="px-5 py-3">Expires</th>
              <th className="px-5 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {filtered.map(lic => (
              <tr key={lic.id} data-reveal className="table-row-hover hover:bg-surface-0 cursor-pointer" onClick={() => setSelectedLicense(lic)}>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-brand-50 text-brand-500 dark:text-brand-300 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                      {lic.customer_name?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-ink">{lic.customer_name}</p>
                      <p className="text-xs text-ink-subtle">{lic.customer_email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3.5">
                  <code className="text-xs font-mono text-ink-muted bg-surface-2 px-2 py-0.5 rounded">{lic.license_key?.substring(0, 16)}...</code>
                </td>
                <td className="px-5 py-3.5"><PlanBadge plan={lic.plan} /></td>
                <td className="px-5 py-3.5 text-ink-muted">{lic.max_machines}</td>
                <td className="px-5 py-3.5 text-ink-muted text-xs">{lic.expires_at ? new Date(lic.expires_at).toLocaleDateString() : 'Lifetime'}</td>
                <td className="px-5 py-3.5"><StatusBadge active={lic.is_active} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="py-12 text-center">
            <div className="w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center mx-auto mb-3 text-ink-subtle">
              <Icons.Key />
            </div>
            <p className="text-sm text-ink-subtle">{search ? 'No matching licenses' : 'No licenses yet'}</p>
            <p className="text-xs text-ink-tertiary mt-1">{search ? 'Try a different search term' : 'Create your first license to get started'}</p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {total > 15 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-ink-subtle">Showing {((page-1)*15)+1}-{Math.min(page*15, total)} of {total}</p>
          <div className="flex gap-1.5">
            <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}
              className="px-3 py-1.5 border border-hairline rounded-md text-xs font-medium text-ink-muted disabled:opacity-40 hover:bg-surface-2 transition-colors">Prev</button>
            <button onClick={() => setPage(p => p+1)} disabled={page * 15 >= total}
              className="px-3 py-1.5 border border-hairline rounded-md text-xs font-medium text-ink-muted disabled:opacity-40 hover:bg-surface-2 transition-colors">Next</button>
          </div>
        </div>
      )}

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create New License">
        <CreateLicenseForm onCreated={loadLicenses} onClose={() => setShowCreate(false)} />
      </Modal>

      {/* Detail Modal */}
      <LicenseDetailModal
        license={selectedLicense}
        open={!!selectedLicense}
        onClose={() => setSelectedLicense(null)}
        onUpdate={loadLicenses}
      />
    </div>
  )
}
