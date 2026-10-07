import { treaty, type Treaty } from '@elysiajs/eden'

import type { App } from '@/server/app'

// Token management
export const TokenStore = {
  get: () => localStorage.getItem('lm_admin_token'),
  set: (token: string) => localStorage.setItem('lm_admin_token', token),
  clear: () => localStorage.removeItem('lm_admin_token'),
}

// Eden Treaty client with JWT auth, typed from the Elysia app
const client = treaty<App>(typeof window === 'undefined' ? 'http://localhost:9000' : window.location.origin, {
  headers() {
    const token = typeof window === 'undefined' ? null : TokenStore.get()
    if (token) return { Authorization: `Bearer ${token}` }
  },
})

export const admin = client.api.v1.admin

/**
 * Resolve an authenticated admin call to its data. Throws on any error;
 * a 401 also drops the stored token and reloads to the login page.
 */
export async function unwrap<R extends { data: unknown; error: { status: unknown; value: unknown } | null }>(
  request: Promise<R>,
): Promise<NonNullable<R['data']>> {
  const { data, error } = await request
  if (error) {
    if (error.status === 401) {
      TokenStore.clear()
      window.location.reload()
      throw new Error('Session expired')
    }
    throw new Error(typeof error.value === 'string' ? error.value : JSON.stringify(error.value))
  }
  return data as NonNullable<R['data']>
}

/** The message of an error thrown by unwrap: the server's "detail" when it sent one. */
export function errorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  try {
    const parsed: unknown = JSON.parse(message)
    if (parsed && typeof parsed === 'object' && 'detail' in parsed && typeof parsed.detail === 'string') return parsed.detail
  } catch {
    // Not JSON: the message is already readable
  }
  return message
}

let metaRequest: Promise<Meta> | undefined

/** Master data (plans, statuses, validation results). Fetched once per page load. */
export function loadMeta(): Promise<Meta> {
  metaRequest ??= unwrap(admin.meta.get()).catch((error) => {
    metaRequest = undefined
    throw error
  })
  return metaRequest
}

/** The server's {"detail": "..."} error message, if it sent one. */
export function errorDetail(error: { value: unknown }, fallback: string): string {
  const value = error.value
  if (value && typeof value === 'object' && 'detail' in value && typeof value.detail === 'string') {
    return value.detail || fallback
  }
  return fallback
}

export type LoginResult = Treaty.Data<typeof admin.auth.login.post>
export type Stats = Treaty.Data<typeof admin.stats.get>
export type License = Treaty.Data<typeof admin.licenses.get>['data'][number]
export type LicenseDetail = Treaty.Data<ReturnType<typeof admin.licenses>['get']>
export type ValidationLog = Treaty.Data<(typeof admin)['validation-logs']['get']>['data'][number]
export type Meta = Treaty.Data<typeof admin.meta.get>
export type AdminUser = Treaty.Data<typeof admin.users.get>[number]
