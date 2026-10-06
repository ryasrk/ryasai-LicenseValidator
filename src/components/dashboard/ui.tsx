'use client'

import { useEffect, type MouseEvent, type ReactNode } from 'react'

import { AnimatedNumber, useEnter } from '@/lib/motion'
import { useTheme, type Theme } from '@/lib/theme'

// App logo: a laurel wreath (Tabler Icons "laurel-wreath", MIT; same artwork as app/icon.svg)
export function Logo({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg className={`text-brand-500 dark:text-brand-400 ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="License Manager">
      <path d="M6.436 8a8.6 8.6 0 0 0 -.436 2.727c0 4.017 2.686 7.273 6 7.273s6 -3.256 6 -7.273a8.6 8.6 0 0 0 -.436 -2.727" />
      <path d="M14.5 21s-.682 -3 -2.5 -3s-2.5 3 -2.5 3" />
      <path d="M18.52 5.23c.292 1.666 -1.02 2.77 -1.02 2.77s-1.603 -.563 -1.895 -2.23c-.292 -1.666 1.02 -2.77 1.02 -2.77s1.603 .563 1.895 2.23" />
      <path d="M21.094 12.14c-1.281 1.266 -3.016 .76 -3.016 .76s-.454 -1.772 .828 -3.04c1.28 -1.266 3.016 -.76 3.016 -.76s.454 1.772 -.828 3.04" />
      <path d="M17.734 18.826c-1.5 -.575 -1.734 -2.19 -1.734 -2.19s1.267 -1.038 2.767 -.462c1.5 .575 1.733 2.19 1.733 2.19s-1.267 1.038 -2.767 .462" />
      <path d="M6.267 18.826c1.5 -.575 1.733 -2.19 1.733 -2.19s-1.267 -1.038 -2.767 -.462c-1.5 .575 -1.733 2.19 -1.733 2.19s1.267 1.038 2.767 .462" />
      <path d="M2.906 12.14c1.281 1.266 3.016 .76 3.016 .76s.454 -1.772 -.828 -3.04c-1.281 -1.265 -3.016 -.76 -3.016 -.76s-.454 1.772 .828 3.04" />
      <path d="M5.48 5.23c-.292 1.666 1.02 2.77 1.02 2.77s1.603 -.563 1.895 -2.23c.292 -1.666 -1.02 -2.77 -1.02 -2.77s-1.603 .563 -1.895 2.23" />
    </svg>
  )
}

// Spinner component
export function Spinner({ size = 'w-4 h-4', color = 'text-white' }: { size?: string; color?: string }) {
  return (
    <svg className={`spinner ${size} ${color}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
  )
}

// Icons (inline SVG)
export const Icons = {
  Key: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>,
  Dashboard: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>,
  Monitor: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>,
  Activity: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>,
  Code: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>,
  Plus: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 4v16m8-8H4" /></svg>,
  Copy: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>,
  Trash: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>,
  Check: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M5 13l4 4L19 7" /></svg>,
  X: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M6 18L18 6M6 6l12 12" /></svg>,
  Refresh: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>,
  Search: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>,
  Settings: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
}

// Light / dark theme switch
export function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, toggle] = useTheme()
  return <ThemeButton theme={theme} onClick={toggle} className={className} />
}

export function ThemeButton({ theme, onClick, className = '' }: {
  theme: Theme
  onClick: (e: MouseEvent<HTMLButtonElement>) => void
  className?: string
}) {
  const label = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label}
      className={`p-1.5 rounded-md transition-colors ${className}`}>
      {theme === 'dark' ? (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
      ) : (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
      )}
    </button>
  )
}

export type ToastType = 'success' | 'error' | 'info'

// Toast notification — refined
export function Toast({ message, type, onClose }: { message: string; type: ToastType; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, [])
  const styles = {
    success: 'bg-surface-1 border-emerald-200 dark:border-emerald-500/25 text-emerald-700 dark:text-emerald-400',
    error: 'bg-surface-1 border-red-200 dark:border-red-500/25 text-red-700 dark:text-red-400',
    info: 'bg-surface-1 border-brand-200 text-brand-700 dark:text-brand-300',
  }
  const ref = useEnter<HTMLDivElement>(true, { y: -12 })
  const icons = {
    success: <span className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-500/15 flex items-center justify-center flex-shrink-0"><Icons.Check /></span>,
    error: <span className="w-5 h-5 rounded-full bg-red-100 dark:bg-red-500/15 flex items-center justify-center flex-shrink-0"><Icons.X /></span>,
    info: <span className="w-5 h-5 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0"><Icons.Check /></span>,
  }
  return (
    <div ref={ref} className={`fixed top-4 right-4 ${styles[type]} border px-4 py-3 rounded-xl shadow-lg z-50 flex items-center gap-2.5 max-w-sm`}>
      {icons[type]}
      <span className="text-sm font-medium">{message}</span>
      <button onClick={onClose} className="ml-auto text-ink-subtle hover:text-ink"><Icons.X /></button>
    </div>
  )
}

const statColors = {
  blue: { bg: 'bg-brand-50', text: 'text-brand-500', bar: 'bg-brand-500' },
  green: { bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', bar: 'bg-emerald-500' },
  purple: { bg: 'bg-violet-50 dark:bg-violet-500/10', text: 'text-violet-600 dark:text-violet-400', bar: 'bg-violet-500' },
  orange: { bg: 'bg-amber-50 dark:bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400', bar: 'bg-amber-500' },
}

// Stat Card — Linear-inspired with subtle accent bar
export function StatCard({ label, value, icon, color, subtitle }: {
  label: string
  value: number
  icon: ReactNode
  color: keyof typeof statColors
  subtitle?: string
}) {
  const c = statColors[color] || statColors.blue
  return (
    <div data-reveal className="bg-surface-1 rounded-xl border border-hairline p-4 sm:p-5 card-hover relative overflow-hidden">
      <div className={`absolute top-0 left-0 w-full h-0.5 ${c.bar}`}></div>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-ink-subtle uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold text-ink mt-1.5 tracking-tight"><AnimatedNumber value={value} /></p>
          {subtitle && <p className="text-xs text-ink-subtle mt-1">{subtitle}</p>}
        </div>
        <div className={`w-8 h-8 sm:w-10 sm:h-10 flex-shrink-0 rounded-lg ${c.bg} ${c.text} flex items-center justify-center`}>
          {icon}
        </div>
      </div>
    </div>
  )
}

// Plan Badge — pill style
export function PlanBadge({ plan }: { plan: string }) {
  const colors: Record<string, string> = {
    starter: 'bg-surface-3 text-ink-muted',
    pro: 'bg-brand-50 text-brand-600 dark:text-brand-300',
    enterprise: 'bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400',
  }
  return <span className={`px-2 py-0.5 rounded text-[11px] font-semibold tracking-wide ${colors[plan] || colors.starter}`}>{plan?.toUpperCase()}</span>
}

// Status Badge — dot + label
export function StatusBadge({ active }: { active: boolean }) {
  return active
    ? <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 pulse-dot"></span><span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Active</span></span>
    : <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-red-400"></span><span className="text-xs font-medium text-red-500">Revoked</span></span>
}

// Modal — glass overlay, refined
export function Modal({ open, onClose, title, children }: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  const backdropRef = useEnter<HTMLDivElement>(open)
  const panelRef = useEnter<HTMLDivElement>(open, { y: 16, scale: 0.97 })
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <div ref={backdropRef} className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}></div>
      <div ref={panelRef} className="relative bg-surface-1 rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto border border-hairline">
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-hairline">
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          <button onClick={onClose} className="text-ink-subtle hover:text-ink p-1 rounded-md hover:bg-surface-2 transition-colors"><Icons.X /></button>
        </div>
        <div className="p-4 sm:p-6">{children}</div>
      </div>
    </div>
  )
}
