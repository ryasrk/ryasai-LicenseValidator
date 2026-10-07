'use client'

import { useCallback, useEffect, useState } from 'react'

import { admin, errorMessage, TokenStore, unwrap, type AdminUser } from '@/lib/api'
import { formatDate } from '@/lib/dates'
import { useReveal } from '@/lib/motion'
import { Icons, Modal, Spinner, StatusBadge } from './ui'

const labelClass = 'block text-xs font-medium text-ink-muted mb-1.5'
const inputClass = 'w-full px-3 py-2 border border-hairline rounded-lg text-sm bg-surface-1 dark:bg-surface-0 input-focus focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none text-ink placeholder:text-ink-tertiary'

function ErrorBox({ message }: { message: string }) {
  if (!message) return null
  return <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/25 text-red-700 dark:text-red-400 px-3 py-2 rounded-md text-sm">{message}</div>
}

function FormActions({ onCancel, loading, label }: { onCancel: () => void; loading: boolean; label: string }) {
  return (
    <div className="flex justify-end gap-2.5 pt-3 border-t border-hairline">
      <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-ink-muted hover:bg-surface-2 rounded-lg transition-colors">Cancel</button>
      <button type="submit" disabled={loading}
        className="px-4 py-2 bg-brand-500 text-white rounded-lg text-sm font-medium btn-primary disabled:opacity-50 flex items-center gap-2">
        {loading && <Spinner />} {label}
      </button>
    </div>
  )
}

// Add an admin, or set a new password for an existing one
function AdminForm({ target, onDone, onClose }: { target: AdminUser | null; onDone: () => void; onClose: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match'); return }
    setError('')
    setLoading(true)
    try {
      if (target) await unwrap(admin.users({ user_id: target.id }).patch({ password }))
      else await unwrap(admin.users.post({ email, password }))
      onDone()
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <ErrorBox message={error} />
      {target ? (
        <p className="text-sm text-ink-muted">New password for <span className="font-medium text-ink">{target.email}</span>. They are signed out everywhere.</p>
      ) : (
        <div>
          <label className={labelClass}>Email *</label>
          <input required type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} placeholder="admin@company.com" autoComplete="off" />
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Password *</label>
          <input required type="password" minLength={8} value={password} onChange={e => setPassword(e.target.value)} className={inputClass} placeholder="Min 8 characters" autoComplete="new-password" />
        </div>
        <div>
          <label className={labelClass}>Confirm password *</label>
          <input required type="password" value={confirm} onChange={e => setConfirm(e.target.value)} className={inputClass} autoComplete="new-password" />
        </div>
      </div>
      <FormActions onCancel={onClose} loading={loading} label={target ? 'Set Password' : 'Add Admin'} />
    </form>
  )
}

// Change your own password; the server then rejects the current token, so this ends in the login screen
function ChangePasswordForm({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match'); return }
    setError('')
    setLoading(true)
    try {
      await unwrap(admin.me.password.post({ current_password: current, new_password: password }))
      TokenStore.clear()
      window.location.reload()
    } catch (err) {
      setError(errorMessage(err))
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <ErrorBox message={error} />
      <p className="text-sm text-ink-muted">You will be signed out and asked to sign in with the new password.</p>
      <div>
        <label className={labelClass}>Current password *</label>
        <input required type="password" value={current} onChange={e => setCurrent(e.target.value)} className={inputClass} autoComplete="current-password" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>New password *</label>
          <input required type="password" minLength={8} value={password} onChange={e => setPassword(e.target.value)} className={inputClass} placeholder="Min 8 characters" autoComplete="new-password" />
        </div>
        <div>
          <label className={labelClass}>Confirm new password *</label>
          <input required type="password" value={confirm} onChange={e => setConfirm(e.target.value)} className={inputClass} autoComplete="new-password" />
        </div>
      </div>
      <FormActions onCancel={onClose} loading={loading} label="Change Password" />
    </form>
  )
}

// Admins Page — the accounts that can sign in to this dashboard
export function AdminsPage() {
  const [admins, setAdmins] = useState<AdminUser[]>([])
  const [me, setMe] = useState<AdminUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [showChange, setShowChange] = useState(false)
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null)

  const loadAdmins = useCallback(() => {
    unwrap(admin.users.get()).then(setAdmins).catch(err => setError(errorMessage(err))).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadAdmins()
    unwrap(admin.me.get()).then(setMe).catch(() => {})
  }, [loadAdmins])

  const setActive = async (target: AdminUser, isActive: boolean) => {
    if (!isActive && !confirm(`Deactivate ${target.email}? They are signed out and can no longer sign in.`)) return
    setError('')
    try {
      await unwrap(admin.users({ user_id: target.id }).patch({ is_active: isActive }))
      loadAdmins()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const revealRef = useReveal<HTMLDivElement>([admins])
  const actionClass = 'px-2.5 py-1 text-xs font-medium rounded-md transition-colors'

  return (
    <div ref={revealRef}>
      <div data-reveal className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-xl font-bold text-ink tracking-tight">Admins</h2>
          <p className="text-sm text-ink-subtle mt-0.5">{admins.length} {admins.length === 1 ? 'account' : 'accounts'}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowChange(true)} className="px-4 py-2 text-sm font-medium text-ink-muted hover:bg-surface-2 rounded-lg border border-hairline transition-colors">
            Change My Password
          </button>
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2 bg-brand-500 text-white rounded-lg text-sm font-medium btn-primary">
            <Icons.Plus /> New Admin
          </button>
        </div>
      </div>

      {error && <div data-reveal className="mb-4"><ErrorBox message={error} /></div>}

      <div data-reveal className="bg-surface-1 rounded-xl border border-hairline overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-surface-2 border-b border-hairline">
            <tr className="text-left text-ink-subtle text-xs font-medium uppercase tracking-wider">
              <th className="px-5 py-3">Email</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Created</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {admins.map(a => {
              const isMe = a.id === me?.id
              return (
                <tr key={a.id} data-reveal className="table-row-hover hover:bg-surface-0">
                  <td className="px-5 py-3.5">
                    <span className="font-medium text-ink">{a.email}</span>
                    {isMe && <span className="ml-2 text-[11px] text-ink-subtle">(you)</span>}
                  </td>
                  <td className="px-5 py-3.5"><StatusBadge active={a.is_active} label={a.is_active ? 'Active' : 'Deactivated'} /></td>
                  <td className="px-5 py-3.5 text-xs text-ink-muted">{formatDate(a.created_at)}</td>
                  <td className="px-5 py-3.5">
                    {!isMe && (
                      <div className="flex justify-end gap-1">
                        <button onClick={() => setResetTarget(a)} className={`${actionClass} text-ink-muted hover:bg-surface-2`}>Set password</button>
                        {a.is_active ? (
                          <button onClick={() => setActive(a, false)} className={`${actionClass} text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10`}>Deactivate</button>
                        ) : (
                          <button onClick={() => setActive(a, true)} className={`${actionClass} text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10`}>Reactivate</button>
                        )}
                      </div>
                    )}
                  </td>
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
      </div>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="New Admin">
        <AdminForm target={null} onDone={loadAdmins} onClose={() => setShowAdd(false)} />
      </Modal>
      <Modal open={!!resetTarget} onClose={() => setResetTarget(null)} title="Set Password">
        <AdminForm target={resetTarget} onDone={loadAdmins} onClose={() => setResetTarget(null)} />
      </Modal>
      <Modal open={showChange} onClose={() => setShowChange(false)} title="Change My Password">
        <ChangePasswordForm onClose={() => setShowChange(false)} />
      </Modal>
    </div>
  )
}
