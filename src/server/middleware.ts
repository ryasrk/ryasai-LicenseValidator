/**
 * Middleware for License Validator.
 *
 * - Client IP resolution
 * - Rate limiting (per IP)
 */

/**
 * Peer address of the request. Route handlers have no socket access, so this reads
 * X-Forwarded-For, which Next.js fills in from the socket when no proxy has set it.
 * The right-most entry is used: it is the one appended by the nearest proxy.
 */
export function getClientIp(request: Request): string | null {
  const ip = request.headers.get('x-forwarded-for')?.split(',').pop()?.trim()
  if (!ip) return null
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip
}

// Rate limits: [max_requests, window_seconds]
const LIMITS: Record<string, [number, number]> = {
  '/api/v1/license/validate': [10, 60], // prevent brute force
  '/api/v1/admin/auth/login': [5, 60], // prevent credential stuffing
}
const DEFAULT_LIMIT: [number, number] = [60, 60]
const CLEANUP_INTERVAL = 60 // seconds

interface RateLimitState {
  requests: Map<string, number[]> // "ip:path" -> request timestamps
  lastCleanup: number
}

// Kept on globalThis so dev hot-reloads don't reset the counters
const globalStore = globalThis as typeof globalThis & { __licenseRateLimit?: RateLimitState }
const state: RateLimitState = (globalStore.__licenseRateLimit ??= {
  requests: new Map(),
  lastCleanup: Date.now() / 1000,
})

/** Remove expired entries. */
function cleanup(now: number) {
  if (now - state.lastCleanup < CLEANUP_INTERVAL) return
  const cutoff = now - 120 // Keep 2 minutes of history
  for (const [key, times] of state.requests) {
    const kept = times.filter((t) => t > cutoff)
    if (kept.length) state.requests.set(key, kept)
    else state.requests.delete(key)
  }
  state.lastCleanup = now
}

/** Returns a 429 response when the caller is over the limit for this path, otherwise nothing. */
export function rateLimit(request: Request): Response | undefined {
  const now = Date.now() / 1000
  cleanup(now)

  const clientIp = getClientIp(request) ?? 'unknown'
  const path = new URL(request.url).pathname

  // Determine rate limit for this path
  let [maxRequests, window] = DEFAULT_LIMIT
  for (const [prefix, limit] of Object.entries(LIMITS)) {
    if (path.startsWith(prefix)) {
      ;[maxRequests, window] = limit
      break
    }
  }

  // Count requests in window
  const key = `${clientIp}:${path}`
  const recent = (state.requests.get(key) ?? []).filter((t) => t > now - window)
  state.requests.set(key, recent)

  if (recent.length >= maxRequests) {
    console.warn(`Rate limit exceeded: ${clientIp} on ${path} (${recent.length}/${maxRequests})`)
    return Response.json(
      { detail: 'Too many requests. Please try again later.', retry_after: window },
      { status: 429, headers: { 'Retry-After': String(window) } },
    )
  }

  recent.push(now)
}
