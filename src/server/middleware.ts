/**
 * Middleware for License Validator.
 *
 * - Client IP resolution
 * - Rate limiting (per IP)
 */
import { settings } from './config'

/** Header carrying the socket address of the request, set by src/instrumentation.ts. Never trusted from a client. */
export const PEER_ADDRESS_HEADER = 'x-peer-address'

const normalizeIp = (ip: string | undefined | null) => {
  const value = ip?.trim()
  if (!value) return null
  return value.startsWith('::ffff:') ? value.slice(7) : value
}

/**
 * Address of the client that sent the request.
 *
 * X-Forwarded-For can be written by anyone, so a client must not be able to pick its own
 * address with it. The header is only believed for the part a trusted proxy wrote:
 *
 * - TRUSTED_PROXY_HOPS = N: N proxies in front of this server each appended the address they
 *   saw, so the entry N places from the right is the client.
 * - TRUSTED_PROXY_HOPS = 0: no proxy. The header is ignored; the socket address is the client.
 * - Unset: detected per request. A connection from a loopback or private address is taken to be
 *   a reverse proxy on this host or network, and its last entry is the client. A connection from
 *   a public address is the client itself, whatever header it sent.
 */
export function getClientIp(request: Request): string | null {
  const peer = normalizeIp(request.headers.get(PEER_ADDRESS_HEADER))
  const forwarded = (request.headers.get('x-forwarded-for') ?? '').split(',').map((part) => part.trim()).filter(Boolean)
  const lastForwarded = normalizeIp(forwarded[forwarded.length - 1])
  const hops = settings.TRUSTED_PROXY_HOPS

  if (hops !== null && hops > 0) return normalizeIp(forwarded[forwarded.length - hops]) ?? peer

  // Without the peer header (instrumentation not loaded) the right-most entry is the best there is:
  // Next.js fills the header in from the socket when the client did not send one
  if (!peer) return lastForwarded

  if (hops === null && isPrivateAddress(peer)) return lastForwarded ?? peer
  return peer
}

function isPrivateAddress(ip: string): boolean {
  return /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|f[cd])/i.test(ip)
}

// Rate limits: [max_requests, window_seconds]
const LIMITS: Record<string, [number, number]> = {
  '/api/v1/license/validate': [10, 60], // prevent brute force
  '/api/v1/admin/auth/login': [5, 60], // prevent credential stuffing
  '/api/v1/license/renew': [30, 60],
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

  // /internal/* endpoints authenticate with a shared secret and are
  // called server-to-server; skip IP-based rate limiting for them.
  if (path.startsWith('/internal/')) return undefined

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
