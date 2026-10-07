'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'

import { admin, errorMessage, loadMeta, unwrap, type License, type LicenseDetail } from '@/lib/api'
import { dayBoundary, formatDate, formatDateTime, toDateInput } from '@/lib/dates'
import { useReveal } from '@/lib/motion'
import { Icons, LicenseStatusBadge, Modal, PlanBadge, Select, Spinner, StatusBadge, type SelectOption } from './ui'

// A license with a product only validates for that app; None works for any app
const productOptions: SelectOption[] = [
  { value: '', label: 'Any app' },
  { value: 'ryasai-chatbot', label: 'ryasai-chatbot (Chatbot)' },
  { value: 'ryasai-visia', label: 'ryasai-visia (Vision Analytics)' },
  { value: 'd2t', label: 'd2t (D2T — Document to Text)' },
  { value: 'peopledet', label: 'peopledet (PeopleDet)' },
]

// Shown until the plans arrive from the server's master data
const defaultPlanOptions: SelectOption[] = [
  { value: 'starter', label: 'Starter' },
  { value: 'pro', label: 'Pro' },
  { value: 'enterprise', label: 'Enterprise' },
  { value: 'flat', label: 'Flat' },
]

const statusFilterOptions: SelectOption[] = [
  { value: 'all', label: 'All Status' },
  { value: 'active', label: 'Active' },
  { value: 'expired', label: 'Expired' },
  { value: 'revoked', label: 'Revoked' },
]

const labelClass = 'block text-xs font-medium text-ink-muted mb-1.5'
const inputClass = 'w-full px-3 py-2 border border-hairline rounded-lg text-sm bg-surface-1 dark:bg-surface-0 input-focus focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none text-ink placeholder:text-ink-tertiary'

/** The options, plus the current value when it is not one of them (a product or plan added outside the dashboard). */
function withCurrent(options: SelectOption[], value: string): SelectOption[] {
  return options.some(option => option.value === value) ? options : [...options, { value, label: value }]
}

// Create License Form — consistent inputs
function CreateLicenseForm({ onCreated, onClose, planOptions }: {
  onCreated: () => void
  onClose: () => void
  planOptions: SelectOption[]
}) {
  const [form, setForm] = useState<{
    customer_name: string
    customer_email: string
    plan: string
    product: string
    slug: string
    max_machines: number | string
    expires_at: string
    notes: string
  }>({
    customer_name: '', customer_email: '', plan: 'starter',
    product: '', slug: '', max_machines: 1, expires_at: '', notes: ''
  })
  const [loading, setLoading] = useState(false)
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { expires_at, notes, slug, ...required } = form
      const result = await unwrap(admin.licenses.post({
        ...required,
        max_machines: parseInt(String(form.max_machines)),
        // Valid through the end of the chosen day, in the admin's time zone
        ...(expires_at ? { expires_at: dayBoundary(expires_at, 'end') } : {}),
        ...(slug ? { slug } : {}),
        ...(notes ? { notes } : {}),
      }))
      setCreatedKey(result.license_key)
      onCreated()
    } catch (err) {
      setError(errorMessage(err))
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

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/25 text-red-700 dark:text-red-400 px-3 py-2 rounded-md text-sm">{error}</div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Customer Name *</label>
          <input required value={form.customer_name} onChange={e => setForm({...form, customer_name: e.target.value})}
            className={inputClass} placeholder="John Doe" />
        </div>
        <div>
          <label className={labelClass}>Email *</label>
          <input required type="email" value={form.customer_email} onChange={e => setForm({...form, customer_email: e.target.value})}
            className={inputClass} placeholder="john@company.com" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Product / App</label>
          <Select ariaLabel="Product / App" value={form.product} onChange={product => setForm({...form, product})}
            options={productOptions} className={inputClass} />
          <p className="text-[11px] text-ink-tertiary mt-1">Must match the app's LICENSE_PRODUCT; Any app skips the check</p>
        </div>
        <div>
          <label className={labelClass}>Organisation Slug</label>
          <input value={form.slug} onChange={e => setForm({...form, slug: e.target.value})}
            className={inputClass} placeholder="acme-corp" maxLength={100} />
          <p className="text-[11px] text-ink-tertiary mt-1">Used by the chat app to renew</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className={labelClass}>Plan</label>
          <Select ariaLabel="Plan" value={form.plan} onChange={plan => setForm({...form, plan})}
            options={planOptions} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Max Machines</label>
          <input required type="number" min="1" value={form.max_machines} onChange={e => setForm({...form, max_machines: e.target.value})}
            className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Expires At</label>
          <input type="date" value={form.expires_at} onChange={e => setForm({...form, expires_at: e.target.value})}
            className={inputClass} />
        </div>
      </div>
      <div>
        <label className={labelClass}>Notes</label>
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

// License Detail Modal — view, edit, machines, renewals
function LicenseDetailModal({ license, open, onClose, onUpdate, planOptions }: {
  license: License | null
  open: boolean
  onClose: () => void
  onUpdate: () => void
  planOptions: SelectOption[]
}) {
  const [detail, setDetail] = useState<LicenseDetail | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    customer_name: '', customer_email: '', plan: 'starter', product: '', slug: '',
    max_machines: '1' as number | string, expires_at: '', notes: '',
  })

  const licenseId = license?.id
  const reload = useCallback(() => {
    if (!licenseId) return
    unwrap(admin.licenses({ license_id: licenseId }).get()).then(setDetail).catch(err => setError(errorMessage(err)))
  }, [licenseId])

  useEffect(() => {
    if (open && licenseId) {
      setDetail(null)
      setEditing(false)
      setError('')
      reload()
    }
  }, [open, licenseId, reload])

  /** Run an action on the license; on failure the modal stays open and shows why. */
  const run = async (action: () => Promise<unknown>, after: 'reload' | 'close') => {
    setError('')
    try {
      await action()
      onUpdate()
      if (after === 'close') onClose()
      else reload()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  if (!license || !detail) return (
    <Modal open={open} onClose={onClose} title="License Details">
      {error
        ? <p className="text-sm text-red-600 dark:text-red-400 py-4">{error}</p>
        : <div className="flex items-center justify-center py-8"><Spinner size="w-5 h-5" color="text-brand-500" /></div>}
    </Modal>
  )

  const target = admin.licenses({ license_id: license.id })

  const handleRevoke = () => {
    if (!confirm('Revoke this license? Client will lose access on its next check.')) return
    run(() => unwrap(target.delete()), 'close')
  }
  const handleReactivate = () => run(() => unwrap(target.patch({ is_active: true })), 'close')
  const handleDelete = () => {
    if (!confirm('Delete this license permanently? Its machines and renewal history are deleted with it. This cannot be undone.')) return
    run(() => unwrap(target.delete(undefined, { query: { permanent: true } })), 'close')
  }
  const handleRemoveMachine = (machineId: string) => {
    if (!confirm('Remove this machine? Its slot is freed; the machine takes a slot again if it checks in.')) return
    run(() => unwrap(target.machines({ machine_id: machineId }).delete()), 'reload')
  }

  const startEdit = () => {
    setForm({
      customer_name: detail.customer_name, customer_email: detail.customer_email, plan: detail.plan,
      product: detail.product, slug: detail.slug ?? '', max_machines: detail.max_machines,
      expires_at: toDateInput(detail.expires_at), notes: detail.notes ?? '',
    })
    setError('')
    setEditing(true)
  }

  const handleSave = async (e: { preventDefault(): void }) => {
    e.preventDefault()
    setSaving(true)
    // An untouched expiry date is not sent, so its time of day is kept
    const expiryChanged = form.expires_at !== toDateInput(detail.expires_at)
    await run(async () => {
      await unwrap(target.patch({
        customer_name: form.customer_name,
        customer_email: form.customer_email,
        plan: form.plan,
        product: form.product,
        slug: form.slug || null,
        max_machines: parseInt(String(form.max_machines)),
        notes: form.notes || null,
        ...(expiryChanged ? { expires_at: form.expires_at ? dayBoundary(form.expires_at, 'end') : null } : {}),
      }))
      setEditing(false)
    }, 'reload')
    setSaving(false)
  }

  const errorBox = error && (
    <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/25 text-red-700 dark:text-red-400 px-3 py-2 rounded-md text-sm">{error}</div>
  )

  if (editing) return (
    <Modal open={open} onClose={onClose} title="Edit License">
      <form onSubmit={handleSave} className="space-y-4">
        {errorBox}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Customer Name *</label>
            <input required value={form.customer_name} onChange={e => setForm({ ...form, customer_name: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Email *</label>
            <input required type="email" value={form.customer_email} onChange={e => setForm({ ...form, customer_email: e.target.value })} className={inputClass} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Product / App</label>
            <Select ariaLabel="Product / App" value={form.product} onChange={product => setForm({ ...form, product })}
              options={withCurrent(productOptions, form.product)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Organisation Slug</label>
            <input value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} className={inputClass} placeholder="acme-corp" maxLength={100} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>Plan</label>
            <Select ariaLabel="Plan" value={form.plan} onChange={plan => setForm({ ...form, plan })}
              options={withCurrent(planOptions, form.plan)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Max Machines</label>
            <input required type="number" min="1" value={form.max_machines} onChange={e => setForm({ ...form, max_machines: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Expires At</label>
            <input type="date" value={form.expires_at} onChange={e => setForm({ ...form, expires_at: e.target.value })} className={inputClass} />
            <p className="text-[11px] text-ink-tertiary mt-1">Empty = lifetime</p>
          </div>
        </div>
        <div>
          <label className={labelClass}>Notes</label>
          <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className={inputClass} placeholder="Optional notes..." />
        </div>
        <div className="flex justify-end gap-2.5 pt-3 border-t border-hairline">
          <button type="button" onClick={() => { setEditing(false); setError('') }} className="px-4 py-2 text-sm font-medium text-ink-muted hover:bg-surface-2 rounded-lg transition-colors">Cancel</button>
          <button type="submit" disabled={saving}
            className="px-4 py-2 bg-brand-500 text-white rounded-lg text-sm font-medium btn-primary disabled:opacity-50 flex items-center gap-2">
            {saving ? <><Spinner /> Saving...</> : 'Save Changes'}
          </button>
        </div>
      </form>
    </Modal>
  )

  const activeMachines = detail.machines.filter(m => m.is_active).length
  const info: [label: string, value: ReactNode, comp?: ReactNode][] = [
    ['Customer', detail.customer_name],
    ['Email', detail.customer_email],
    ['Plan', null, <PlanBadge key="plan" plan={detail.plan} />],
    ['Status', null, <LicenseStatusBadge key="status" license={detail} />],
    ['Product', detail.product || '-'],
    ['Slug', detail.slug || '-'],
    ['Max Machines', detail.max_machines],
    ['Expires', formatDate(detail.expires_at, 'Lifetime')],
    ['Created', formatDate(detail.created_at)],
    ['Updated', formatDateTime(detail.updated_at)],
  ]

  return (
    <Modal open={open} onClose={onClose} title="License Details">
      <div className="space-y-5">
        {errorBox}

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
            <div key={i} className="text-sm min-w-0">
              <p className="text-[10px] font-medium text-ink-subtle uppercase tracking-wider mb-0.5">{label}</p>
              {comp || <p className="font-medium text-ink break-words">{value}</p>}
            </div>
          ))}
        </div>

        {detail.notes && (
          <div>
            <p className="text-[10px] font-medium text-ink-subtle uppercase tracking-wider mb-1">Notes</p>
            <p className="text-sm text-ink-muted whitespace-pre-wrap break-words">{detail.notes}</p>
          </div>
        )}

        {/* Machines */}
        {detail.machines.length > 0 && (
          <div>
            <p className="text-[10px] font-medium text-ink-subtle uppercase tracking-wider mb-2">
              Machines ({activeMachines}/{detail.max_machines} slots used)
            </p>
            <div className="space-y-1.5">
              {detail.machines.map(m => (
                <div key={m.id} className="flex items-center justify-between gap-3 bg-surface-2 rounded-lg px-3 py-2.5 border border-hairline">
                  <div className="min-w-0">
                    <code title={m.machine_id} className="block text-xs font-mono text-ink-muted truncate">{m.machine_id}</code>
                    <p className="text-[11px] text-ink-subtle mt-0.5 truncate">
                      {[m.hostname, m.ip_address].filter(Boolean).join(' · ') || '-'} · Last seen: {formatDateTime(m.last_seen)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <StatusBadge active={m.is_active} label={m.status} tone={m.is_active ? 'green' : 'gray'} />
                    {m.is_active && (
                      <button onClick={() => handleRemoveMachine(m.id)} title="Remove machine" aria-label="Remove machine"
                        className="p-1 rounded-md text-ink-subtle hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                        <Icons.Trash />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Renewals */}
        {detail.renewals.length > 0 && (
          <div>
            <p className="text-[10px] font-medium text-ink-subtle uppercase tracking-wider mb-2">Renewals ({detail.renewals.length})</p>
            <div className="space-y-1.5">
              {detail.renewals.map(r => (
                <div key={r.id} className="bg-surface-2 rounded-lg px-3 py-2.5 border border-hairline">
                  <p className="text-xs text-ink-muted">
                    {formatDate(r.previous_expires_at)} → <span className="font-medium text-ink">{formatDate(r.expires_at)}</span>
                    {r.extend_days != null && <span className="text-ink-subtle"> (+{r.extend_days} days)</span>}
                  </p>
                  <p className="text-[11px] text-ink-subtle mt-0.5 truncate">
                    {formatDateTime(r.created_at)} · {r.source || 'unknown source'} · <code className="font-mono">{r.reference}</code>
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap justify-between gap-2 pt-3 border-t border-hairline">
          <div className="flex gap-1">
            {detail.is_active ? (
              <button onClick={handleRevoke} className="px-3 py-2 text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg flex items-center gap-1.5 transition-colors">
                <Icons.X /> Revoke
              </button>
            ) : (
              <>
                <button onClick={handleReactivate} className="px-3 py-2 text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded-lg flex items-center gap-1.5 transition-colors">
                  <Icons.Check /> Reactivate
                </button>
                <button onClick={handleDelete} className="px-3 py-2 text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg flex items-center gap-1.5 transition-colors">
                  <Icons.Trash /> Delete
                </button>
              </>
            )}
          </div>
          <div className="flex gap-1">
            <button onClick={startEdit} className="px-4 py-2 text-sm font-medium text-brand-600 dark:text-brand-300 hover:bg-brand-50 rounded-lg transition-colors">Edit</button>
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-ink-muted hover:bg-surface-2 rounded-lg transition-colors">Close</button>
          </div>
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
  const [planOptions, setPlanOptions] = useState(defaultPlanOptions)

  useEffect(() => {
    loadMeta().then(meta => setPlanOptions(meta.plans.map(plan => ({ value: plan.code, label: plan.name })))).catch(() => {})
  }, [])

  // The search the list was last asked for; follows the input after a short pause in typing
  const [query, setQuery] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim())
      setPage(1)
    }, 250)
    return () => clearTimeout(timer)
  }, [search])

  // The server searches and pages, so the total and the page count cover every match
  const loadLicenses = useCallback(() => {
    const state = filter === 'active' || filter === 'expired' || filter === 'revoked' ? filter : undefined
    let stale = false
    unwrap(admin.licenses.get({ query: { page, per_page: 15, ...(state ? { state } : {}), ...(query ? { search: query } : {}) } })).then(d => {
      if (stale) return
      setLicenses(d.data || [])
      setTotal(d.total || 0)
    })
    return () => { stale = true }
  }, [page, filter, query])

  useEffect(() => loadLicenses(), [loadLicenses])

  const revealRef = useReveal<HTMLDivElement>([licenses])

  return (
    <div ref={revealRef}>
      <div data-reveal className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-xl font-bold text-ink tracking-tight">Licenses</h2>
          <p className="text-sm text-ink-subtle mt-0.5">{total} {query ? 'matching' : 'total'} licenses</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-500 text-white rounded-lg text-sm font-medium btn-primary">
          <Icons.Plus /> New License
        </button>
      </div>

      {/* Search & Filter bar */}
      {/* Above the table, so the open filter list is not covered by it */}
      <div data-reveal className="relative z-10 flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle"><Icons.Search /></span>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, email, key, or slug..."
            className="w-full pl-9 pr-4 py-2 border border-hairline rounded-lg text-sm bg-surface-1 dark:text-ink input-focus focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none placeholder:text-ink-tertiary" />
        </div>
        <Select ariaLabel="Status filter" value={filter} onChange={value => { setFilter(value); setPage(1); }}
          options={statusFilterOptions}
          className="w-36 px-3 py-2 border border-hairline rounded-lg text-sm text-ink-muted bg-surface-1 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none" />
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
            {licenses.map(lic => (
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
                <td className="px-5 py-3.5 text-ink-muted">{lic.active_machines}/{lic.max_machines}</td>
                <td className="px-5 py-3.5 text-ink-muted text-xs">{formatDate(lic.expires_at, 'Lifetime')}</td>
                <td className="px-5 py-3.5"><LicenseStatusBadge license={lic} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {licenses.length === 0 && (
          <div className="py-12 text-center">
            <div className="w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center mx-auto mb-3 text-ink-subtle">
              <Icons.Key />
            </div>
            <p className="text-sm text-ink-subtle">{query ? 'No matching licenses' : 'No licenses yet'}</p>
            <p className="text-xs text-ink-tertiary mt-1">{query ? 'Try a different search term' : 'Create your first license to get started'}</p>
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
        <CreateLicenseForm onCreated={loadLicenses} onClose={() => setShowCreate(false)} planOptions={planOptions} />
      </Modal>

      {/* Detail Modal */}
      <LicenseDetailModal
        license={selectedLicense}
        open={!!selectedLicense}
        onClose={() => setSelectedLicense(null)}
        onUpdate={loadLicenses}
        planOptions={planOptions}
      />
    </div>
  )
}
