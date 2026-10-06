/**
 * HMAC Request Signing Verification.
 *
 * Client apps sign requests with shared secret.
 * License Manager verifies signature to prevent tampering/replay.
 *
 * Header format:
 *   X-Signature: <hmac_hex>
 *   X-Timestamp: <unix_timestamp>
 *
 * Signature = HMAC-SHA256(secret, `${timestamp}:${method}:${path}:${body}`)
 * Replay window: 5 minutes
 *
 * Not applied to any route yet, as in the Python server it was ported from.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

import { settings } from './config'

// Max age of request signature (5 minutes)
const MAX_SIGNATURE_AGE = 300

/** Compute HMAC-SHA256 signature. */
export function computeSignature(timestamp: string, method: string, path: string, body = ''): string {
  return createHmac('sha256', settings.SECRET_KEY).update(`${timestamp}:${method}:${path}:${body}`).digest('hex')
}

export type HmacResult = { ok: true; signed: boolean } | { ok: false; detail: string }

/**
 * Verify HMAC signature on incoming request.
 * Unsigned requests are allowed (backward compatibility) and reported as signed: false.
 */
export function verifyHmacSignature(request: Request, body: string): HmacResult {
  const signature = request.headers.get('x-signature')
  const timestamp = request.headers.get('x-timestamp')

  if (!signature || !timestamp) return { ok: true, signed: false }

  // Check replay window
  if (!/^[+-]?\d+$/.test(timestamp.trim())) return { ok: false, detail: 'Invalid timestamp' }
  const age = Math.floor(Date.now() / 1000) - Number(timestamp)
  if (Math.abs(age) > MAX_SIGNATURE_AGE) {
    console.warn(`Signature expired: age=${age}s`)
    return { ok: false, detail: 'Request signature expired' }
  }

  const expected = Buffer.from(computeSignature(timestamp, request.method, new URL(request.url).pathname, body))
  const given = Buffer.from(signature)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    console.warn(`Invalid signature on ${new URL(request.url).pathname}`)
    return { ok: false, detail: 'Invalid request signature' }
  }

  return { ok: true, signed: true }
}
