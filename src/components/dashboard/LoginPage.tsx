'use client'

import { animate } from 'animejs'
import { useEffect, useRef, useState, type MouseEvent, type Ref } from 'react'
import { flushSync } from 'react-dom'

import { admin, errorDetail, TokenStore, type LoginResult } from '@/lib/api'
import { isDesktop, useReveal } from '@/lib/motion'
import { useTheme, type Theme } from '@/lib/theme'
import { LoginHero, type LoginHeroHandle } from './LoginHero'
import { Icons, Spinner, ThemeButton } from './ui'

const THEMES: Theme[] = ['dark', 'light']

const labelClass = 'block text-xs font-medium text-ink-muted mb-1.5'
const inputClass = 'w-full px-2.5 py-1.5 rounded-md border border-hairline bg-surface-0 dark:border-white/10 dark:bg-[#1b1e2e] text-sm text-ink input-focus focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 dark:focus:border-brand-400 outline-none placeholder:text-ink-tertiary'

/** Form state shared by both theme layers, so they always show the same thing. */
interface LoginForm {
  isSetup: boolean
  email: string
  password: string
  passwordConfirm: string
  showPassword: boolean
  error: string
  loading: boolean
  setEmail: (value: string) => void
  setPassword: (value: string) => void
  setPasswordConfirm: (value: string) => void
  setShowPassword: (value: boolean) => void
  onSubmit: (e: { preventDefault(): void }) => void
}

/**
 * The whole login screen drawn in one theme. Two of these are stacked (dark and light)
 * so a theme change can reveal one over the other while both keep animating.
 */
function LoginLayer({ theme, layerRef, heroRef, visible, current, intro, onHeroReady, form }: {
  theme: Theme
  layerRef: Ref<HTMLDivElement>
  heroRef: Ref<LoginHeroHandle>
  visible: boolean
  current: boolean // the layer of the active theme: on top and interactive
  intro: boolean
  onHeroReady?: () => void
  form: LoginForm
}) {
  const revealRef = useReveal<HTMLDivElement>([])
  const { isSetup } = form

  return (
    // The theme class scopes the colors of everything inside, independent of <html>
    <div ref={layerRef} inert={!current} aria-hidden={!current}
      className={`${theme} absolute inset-0 overflow-y-auto ${current ? 'z-20' : 'z-10'} ${visible ? '' : 'invisible'}`}>
      <div className="relative min-h-full overflow-hidden bg-gradient-to-br from-[#f7f8fd] to-[#e8ebf8] dark:from-[#191d2f] dark:to-[#121522] text-ink">
        {/* Artwork: glow, character, fade into the floor */}
        <div className="pointer-events-none absolute inset-0 hidden md:block" aria-hidden="true">
          <div className="absolute right-0 top-0 h-full w-[60%] bg-[radial-gradient(ellipse_at_62%_40%,rgba(94,106,210,0.16),transparent_60%)] dark:bg-[radial-gradient(ellipse_at_62%_40%,rgba(64,96,210,0.3),transparent_60%)]"></div>
          <LoginHero ref={heroRef} theme={theme} active={visible} intro={intro} onReady={onHeroReady} className="absolute right-0 top-0 h-[170%] w-auto max-w-none" />
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#eaedf9] dark:from-[#131624] to-transparent"></div>
        </div>

        <div ref={revealRef} className="relative z-10 min-h-screen flex flex-col justify-center p-6 sm:p-10 lg:p-[52px]">
          <div data-reveal data-login-card className="relative w-full max-w-[376px] mx-auto md:mx-0 rounded-xl border border-brand-500/30 bg-surface-1/95 dark:bg-[#222536]/95 px-[30px] py-8 shadow-[0_0_50px_-12px_rgba(94,106,210,0.35)]">
            {/* Decorative lines: corner ticks and a short accent rule */}
            <span aria-hidden="true" className="pointer-events-none absolute top-2 left-2 w-2.5 h-2.5 border-l border-t border-brand-500/50"></span>
            <span aria-hidden="true" className="pointer-events-none absolute top-2 right-2 w-2.5 h-2.5 border-r border-t border-brand-500/50"></span>
            <span aria-hidden="true" className="pointer-events-none absolute bottom-2 left-2 w-2.5 h-2.5 border-l border-b border-brand-500/50"></span>
            <span aria-hidden="true" className="pointer-events-none absolute bottom-2 right-2 w-2.5 h-2.5 border-r border-b border-brand-500/50"></span>
            <span aria-hidden="true" className="pointer-events-none absolute -top-px left-[30px] w-12 h-px bg-brand-500"></span>

            <h1 data-reveal className="text-2xl font-medium text-ink tracking-tight">
              {isSetup ? 'Create admin' : 'Sign in'}
            </h1>
            <p data-reveal className="text-sm text-ink-muted mt-1.5">
              {isSetup ? 'Create your admin account to get started.' : 'Enter your email and password to continue.'}
            </p>
            {isSetup && (
              <div className="mt-3 px-3 py-2 bg-brand-50 border border-brand-200 rounded-md text-xs text-brand-700 dark:text-brand-300 font-medium">
                First-time setup — create your admin credentials
              </div>
            )}

            <form onSubmit={form.onSubmit} className="mt-5 space-y-4">
              {form.error && (
                <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/25 text-red-700 dark:text-red-400 px-3 py-2 rounded-md text-sm flex items-center gap-2 fade-in">
                  <Icons.X />
                  <span>{form.error}</span>
                </div>
              )}
              <div data-reveal>
                <label htmlFor={`login-email-${theme}`} className={labelClass}>Email</label>
                <input id={`login-email-${theme}`} type="email" value={form.email} onChange={e => form.setEmail(e.target.value)}
                  className={inputClass} placeholder="you@company.com" autoComplete="username" required autoFocus={current} />
              </div>
              <div data-reveal>
                <label htmlFor={`login-password-${theme}`} className={labelClass}>
                  {isSetup ? 'Create password' : 'Password'}
                </label>
                <div className="relative">
                  <input id={`login-password-${theme}`} type={form.showPassword ? 'text' : 'password'} value={form.password} onChange={e => form.setPassword(e.target.value)}
                    className={`${inputClass} pr-10`} placeholder={isSetup ? 'Min 8 characters' : 'Enter password'}
                    autoComplete={isSetup ? 'new-password' : 'current-password'} required minLength={isSetup ? 8 : 1} />
                  <button type="button" onClick={() => form.setShowPassword(!form.showPassword)}
                    title={form.showPassword ? 'Hide password' : 'Show password'} aria-label={form.showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-subtle hover:text-ink transition-colors">
                    {form.showPassword ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    )}
                  </button>
                </div>
              </div>
              {isSetup && (
                <div data-reveal>
                  <label htmlFor={`login-password-confirm-${theme}`} className={labelClass}>Confirm password</label>
                  <input id={`login-password-confirm-${theme}`} type="password" value={form.passwordConfirm} onChange={e => form.setPasswordConfirm(e.target.value)}
                    className={inputClass} placeholder="Re-enter password" autoComplete="new-password" required />
                </div>
              )}
              <button data-reveal type="submit" disabled={form.loading}
                className="w-full !mt-6 border border-brand-500 text-brand-600 dark:border-brand-400/80 dark:text-brand-400 hover:bg-brand-500/10 text-sm font-medium py-2 rounded-md transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {form.loading ? (
                  <><Spinner color="text-brand-500 dark:text-brand-400" /> {isSetup ? 'Creating account...' : 'Signing in...'}</>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" transform="matrix(-1 0 0 1 24 0)" /></svg>
                    {isSetup ? 'Create account & sign in' : 'Sign in'}
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

// Login Page (handles both setup and login)
export function LoginPage({ onLogin, onReady }: {
  onLogin: (data: LoginResult) => void
  onReady?: () => void // the screen is built and can be shown
}) {
  const [mode, setMode] = useState<'loading' | 'setup' | 'login'>('loading')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const [theme, toggleTheme] = useTheme()
  const [initialTheme] = useState(theme)
  // The theme being covered while the wave of the new one spreads over it
  const [leaving, setLeaving] = useState<Theme | null>(null)
  const layers = useRef<Record<Theme, HTMLDivElement | null>>({ dark: null, light: null })
  const heroes = useRef<Record<Theme, LoginHeroHandle | null>>({ dark: null, light: null })

  // Leaving the login (desktop only): the card fades out while the whole character shatters
  const playExit = async () => {
    if (!isDesktop()) return
    const card = layers.current[theme]?.querySelector<HTMLElement>('[data-login-card]')
    if (card) {
      animate(card, {
        opacity: 0, y: -10, duration: 200, ease: 'out(2)',
        onComplete: () => { card.style.visibility = 'hidden' },
      })
    }
    await heroes.current[theme]?.shatterAll()
  }

  useEffect(() => {
    admin.auth['setup-status'].get()
      .then(({ data }) => setMode(data?.setup_required ? 'setup' : 'login'))
      .catch(() => setMode('login'))
  }, [])

  const handleLogin = async (e: { preventDefault(): void }) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data, error } = await admin.auth.login.post({ email, password })
      if (error) throw new Error(errorDetail(error, 'Login failed'))
      TokenStore.set(data.access_token)
      await playExit()
      onLogin(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const handleSetup = async (e: { preventDefault(): void }) => {
    e.preventDefault()
    setError('')
    if (password !== passwordConfirm) { setError('Passwords do not match'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    setLoading(true)
    try {
      const { data, error } = await admin.auth.setup.post({ email, password, password_confirm: passwordConfirm })
      if (error) throw new Error(errorDetail(error, 'Setup failed'))
      TokenStore.set(data.access_token)
      await playExit()
      onLogin(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  // On phones there is no artwork to wait for
  useEffect(() => {
    if (mode !== 'loading' && !isDesktop()) onReady?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // Theme change as a wave: the new theme's layer comes on top, clipped to a circle
  // that grows from the button until it covers the screen
  const handleThemePress = (e: MouseEvent<HTMLButtonElement>) => {
    if (leaving) return
    const box = e.currentTarget.getBoundingClientRect()
    const x = box.left + box.width / 2, y = box.top + box.height / 2
    const from = theme, to: Theme = from === 'dark' ? 'light' : 'dark'

    flushSync(() => {
      setLeaving(from)
      toggleTheme()
    })

    const layer = layers.current[to]
    if (!layer) {
      setLeaving(null)
      return
    }
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
    layer
      .animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 900, easing: 'cubic-bezier(0.45, 0, 0.2, 1)' },
      )
      .finished.catch(() => {})
      .finally(() => setLeaving(null))
  }

  // Nothing is drawn until the setup status is known; the screen then fades in
  if (mode === 'loading') return null

  const isSetup = mode === 'setup'
  const form: LoginForm = {
    isSetup, email, password, passwordConfirm, showPassword, error, loading,
    setEmail, setPassword, setPasswordConfirm, setShowPassword,
    onSubmit: isSetup ? handleSetup : handleLogin,
  }

  return (
    <div className="relative h-screen overflow-hidden screen-fade-in">
      {THEMES.map(layerTheme => (
        <LoginLayer key={layerTheme} theme={layerTheme}
          layerRef={el => { layers.current[layerTheme] = el }}
          heroRef={handle => { heroes.current[layerTheme] = handle }}
          visible={layerTheme === theme || layerTheme === leaving}
          current={layerTheme === theme}
          intro={layerTheme === initialTheme}
          onHeroReady={layerTheme === initialTheme ? onReady : undefined}
          form={form} />
      ))}

      <ThemeButton theme={theme} onClick={handleThemePress}
        className="absolute top-4 right-4 z-30 text-ink-subtle hover:text-ink hover:bg-surface-2/70" />
    </div>
  )
}
