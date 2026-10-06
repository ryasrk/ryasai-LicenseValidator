'use client'

import { animate, utils } from 'animejs'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'

import { admin, TokenStore, unwrap, type LoginResult } from '@/lib/api'
import { isDesktop } from '@/lib/motion'
import { LoginPage } from './LoginPage'
import { Icons, Logo, ThemeToggle, Toast, type ToastType } from './ui'

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

interface User {
  email: string
}

// Main App (with auth gate)
const navItems = [
  { href: '/', label: 'Dashboard', short: 'Dashboard', icon: <Icons.Dashboard /> },
  { href: '/licenses', label: 'Licenses', short: 'Licenses', icon: <Icons.Key /> },
  { href: '/logs', label: 'Validation Logs', short: 'Logs', icon: <Icons.Activity /> },
  { href: '/docs', label: 'API Docs', short: 'Docs', icon: <Icons.Code /> },
]

function AdminPanel({ user, onLogout, children }: { user: User | null; onLogout: () => void; children: ReactNode }) {
  const pathname = usePathname()
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const navRef = useRef<HTMLElement>(null)
  const highlightRef = useRef<HTMLDivElement>(null)
  const highlightPlaced = useRef(false)

  // Slide the highlight behind the active nav link
  useLayoutEffect(() => {
    const highlight = highlightRef.current
    const active = navRef.current?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!highlight) return
    if (!active) {
      utils.set(highlight, { opacity: 0 })
      highlightPlaced.current = false
      return
    }
    const target = { y: active.offsetTop, height: active.offsetHeight, opacity: 1 }
    if (!highlightPlaced.current) {
      utils.set(highlight, target)
      highlightPlaced.current = true
      return
    }
    const animation = animate(highlight, { ...target, duration: 380, ease: 'out(4)' })
    return () => {
      animation.pause()
    }
  }, [pathname])

  return (
    <div className="flex flex-col md:flex-row h-[100dvh] bg-surface-0 screen-fade-in">
      {/* Top bar (phones) */}
      <header className="md:hidden flex items-center justify-between gap-3 px-4 py-2.5 bg-surface-1 border-b border-hairline">
        <div className="flex items-center gap-2.5 min-w-0">
          <Logo className="w-7 h-7 flex-shrink-0" />
          <span className="text-sm font-semibold text-ink tracking-tight truncate">License Manager</span>
        </div>
        <div className="flex items-center flex-shrink-0">
          <ThemeToggle className="text-ink-subtle hover:text-ink hover:bg-surface-2 p-2" />
          <button onClick={onLogout} title="Sign out" aria-label="Sign out"
            className="text-ink-subtle hover:text-red-500 transition-colors p-2 rounded-md hover:bg-red-50 dark:hover:bg-red-500/10">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </header>

      {/* Sidebar (tablets and up) — Linear-inspired light surface */}
      <aside className="hidden md:flex w-60 flex-shrink-0 bg-surface-1 border-r border-hairline flex-col">
        <div className="px-5 py-5 border-b border-hairline">
          <div className="flex items-center gap-3">
            <Logo className="w-8 h-8 flex-shrink-0" />
            <div>
              <h1 className="text-sm font-semibold text-ink tracking-tight">License Manager</h1>
              <p className="text-xs text-ink-subtle">Admin Panel</p>
            </div>
          </div>
        </div>

        <nav ref={navRef} className="relative isolate flex-1 px-3 py-4 space-y-0.5">
          {navItems.map(item => {
            const active = pathname === item.href
            return (
              <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined}
                className={`relative w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-150 ${
                  active
                    ? 'text-brand-600 dark:text-brand-300'
                    : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
                }`}>
                <span className={active ? 'text-brand-500' : ''}>{item.icon}</span>
                {item.label}
              </Link>
            )
          })}
          {/* Last child, so it does not shift the spacing between the links */}
          <div ref={highlightRef} aria-hidden="true"
            className="absolute left-3 right-3 top-0 -z-10 !mt-0 rounded-md bg-brand-50 shadow-sm pointer-events-none opacity-0"></div>
        </nav>

        <div className="px-4 py-4 border-t border-hairline">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-600 dark:text-brand-300 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                {(user?.email || 'A')[0].toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-xs text-ink truncate">{user?.email || 'Admin'}</p>
              </div>
            </div>
            <div className="flex items-center flex-shrink-0">
              <ThemeToggle className="text-ink-subtle hover:text-ink hover:bg-surface-2" />
              <button onClick={onLogout} title="Sign out"
                className="text-ink-subtle hover:text-red-500 transition-colors p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-500/10">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-h-0 overflow-auto bg-surface-0">
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
          {children}
        </div>
      </main>

      {/* Tab bar (phones) */}
      <nav className="md:hidden grid grid-cols-4 bg-surface-1 border-t border-hairline pb-[env(safe-area-inset-bottom)]">
        {navItems.map(item => {
          const active = pathname === item.href
          return (
            <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${
                active ? 'text-brand-600 dark:text-brand-300' : 'text-ink-subtle'
              }`}>
              {item.icon}
              {item.short}
            </Link>
          )
        })}
      </nav>

      {/* Toast */}
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  )
}

export default function App({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState(!!TokenStore.get())
  const [user, setUser] = useState<User | null>(null)
  const [verifying, setVerifying] = useState(!!TokenStore.get())

  // Verify token on mount
  useEffect(() => {
    const token = TokenStore.get()
    if (token) {
      unwrap(admin.stats.get()).then(() => {
        setAuthenticated(true)
      }).catch(() => {
        TokenStore.clear()
        setAuthenticated(false)
      }).finally(() => setVerifying(false))
    } else {
      setVerifying(false)
    }
  }, [])

  const veilRef = useRef<HTMLDivElement>(null)
  const loginReady = useRef<(() => void) | null>(null)

  /**
   * Switches between the login and the admin. On desktop the screen fades to white,
   * the switch happens behind it, and the new screen fades in.
   */
  const switchScreen = async (apply: () => void, toLogin = false) => {
    const veil = veilRef.current
    if (!veil || !isDesktop()) return apply()
    await animate(veil, { opacity: 1, duration: 240, ease: 'in(2)' })

    // The login builds its artwork after mounting; fading before that is done would stutter
    const ready = toLogin
      ? Promise.race([new Promise<void>((resolve) => { loginReady.current = resolve }), wait(3000)])
      : Promise.resolve()
    flushSync(apply)
    await ready
    await nextFrame()
    await nextFrame()
    animate(veil, { opacity: 0, duration: 560, ease: 'out(2)' })
  }

  const handleLogin = (data: LoginResult) =>
    switchScreen(() => {
      setUser({ email: data.email })
      setAuthenticated(true)
    })

  const handleLogout = () =>
    switchScreen(() => {
      TokenStore.clear()
      setAuthenticated(false)
      setUser(null)
    }, true)

  const veil = <div ref={veilRef} aria-hidden="true" className="fixed inset-0 z-[60] bg-white pointer-events-none opacity-0"></div>

  // Nothing is drawn while the token is verified; the screen then fades in
  if (verifying) return null

  if (!authenticated) {
    return <>{veil}<LoginPage onLogin={handleLogin} onReady={() => loginReady.current?.()} /></>
  }

  return <>{veil}<AdminPanel user={user} onLogout={handleLogout}>{children}</AdminPanel></>
}
