/** License validation endpoints — called by client apps. */
import { createPrivateKey, randomUUID, sign, type KeyObject } from 'node:crypto'
import { Elysia, t } from 'elysia'

import { DEFAULT_SECRET_KEY, settings } from '../config'
import {
  getDb,
  transaction,
  type LicenseRenewalRow,
  type LicenseRow,
  type LicenseStatusRow,
  type MachineActivationRow,
} from '../db'
import { verifyHmacSignature } from '../hmac'
import { getClientIp } from '../middleware'
import { daysAgoDb, dbToMs, nowDb, parseIso, toDb, toIso } from '../time'

interface ValidateResult {
  nonce: string
  valid: boolean
  message: string
  plan?: string
  expires_at?: string | null
  signature?: string
}

// Ed25519 private key for signing responses, loaded on first use
let signingKey: KeyObject | null | undefined

function getSigningKey(): KeyObject | null {
  if (signingKey === undefined) {
    signingKey = settings.LICENSE_SIGNING_PRIVATE_KEY
      ? createPrivateKey({
          key: Buffer.from(settings.LICENSE_SIGNING_PRIVATE_KEY, 'hex'),
          format: 'der',
          type: 'pkcs8',
        })
      : null
  }
  return signingKey
}

/**
 * Canonical JSON that client apps verify against: keys sorted, no whitespace, non-ASCII
 * escaped. Must stay byte-identical to Python's
 * json.dumps(payload, sort_keys=True, separators=(",", ":")).
 */
function canonicalJson(payload: object): string {
  const sorted = Object.fromEntries(Object.entries(payload).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
  return JSON.stringify(sorted).replace(
    /[\u007f-￿]/g,
    (ch) => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'),
  )
}

/** Sign canonical JSON of payload (excluding signature field) with Ed25519. */
function signed(payload: ValidateResult): ValidateResult {
  const key = getSigningKey()
  if (key) payload.signature = sign(null, Buffer.from(canonicalJson(payload)), key).toString('hex')
  return payload
}

// A replaced machine may take its slot back once the machine that took it has been silent this long
const RECLAIM_AFTER_MS = 24 * 3_600_000
const PRUNE_INTERVAL_MS = 3_600_000
let lastPrune = 0

/** Delete validation logs past LOG_RETENTION_DAYS, at most once an hour. */
function pruneLogs() {
  if (!settings.LOG_RETENTION_DAYS || Date.now() - lastPrune < PRUNE_INTERVAL_MS) return
  lastPrune = Date.now()
  getDb().prepare('DELETE FROM validation_logs WHERE timestamp < ?').run(daysAgoDb(settings.LOG_RETENTION_DAYS))
}

/** Log validation attempt. */
function logValidation(
  licenseId: string | null,
  licenseKey: string,
  machineId: string,
  result: string,
  ip: string | null,
  metadata: Record<string, string | undefined>,
) {
  const extra = Object.fromEntries(Object.entries(metadata).filter(([, value]) => value))
  getDb()
    .prepare(
      `INSERT INTO validation_logs (id, license_id, license_key, machine_id, result_code, ip_address, timestamp, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(randomUUID(), licenseId, licenseKey, machineId, result, ip, nowDb(), Object.keys(extra).length ? JSON.stringify(extra) : null)
  pruneLogs()
}

/** Give back the slots of machines that have not checked in for MACHINE_STALE_DAYS. */
export function releaseStaleMachines(licenseId: string) {
  if (!settings.MACHINE_STALE_DAYS) return
  getDb()
    .prepare(
      `UPDATE machine_activations SET status_code = 'stale', status_changed_at = ?
       WHERE license_id = ? AND status_code = 'active' AND last_seen < ?`,
    )
    .run(nowDb(), licenseId, daysAgoDb(settings.MACHINE_STALE_DAYS))
}

function setMachineStatus(id: string, status: string) {
  getDb().prepare('UPDATE machine_activations SET status_code = ?, status_changed_at = ? WHERE id = ?').run(status, nowDb(), id)
}

const validateRequest = t.Object({
  license_key: t.String({ minLength: 1, maxLength: 64 }),
  machine_id: t.String({ minLength: 1, maxLength: 255 }),
  product: t.Optional(t.String({ maxLength: 50 })), // the app identifying itself; must match a license that names a product
  version: t.Optional(t.String({ maxLength: 50 })),
  hostname: t.Optional(t.String({ maxLength: 200 })),
  os_info: t.Optional(t.String({ maxLength: 200 })),
  nonce: t.Optional(t.String({ maxLength: 128 })), // client-generated random hex, echoed back in response
})

// ─── Renewal ─────────────────────────────────────────────────────────────────

interface RenewRequest {
  reference: string
  license_key?: string
  slug?: string
  extend_days?: number
  expires_at?: string
  source?: string
}

const isText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max

/** Checked by hand: the body is read as text so the signature covers the exact bytes sent. */
function parseRenewRequest(raw: string): RenewRequest | string {
  let body: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return 'Request body must be a JSON object'
    body = parsed as Record<string, unknown>
  } catch {
    return 'Invalid request body'
  }

  if (!isText(body.reference, 100)) return 'reference is required (string, at most 100 characters)'
  const hasKey = body.license_key !== undefined, hasSlug = body.slug !== undefined
  if (hasKey === hasSlug) return 'Send exactly one of license_key or slug'
  if (hasKey && !isText(body.license_key, 64)) return 'license_key must be a string of at most 64 characters'
  if (hasSlug && !isText(body.slug, 100)) return 'slug must be a string of at most 100 characters'

  const hasDays = body.extend_days !== undefined, hasDate = body.expires_at !== undefined
  if (hasDays === hasDate) return 'Send exactly one of extend_days or expires_at'
  if (hasDays && !(Number.isInteger(body.extend_days) && (body.extend_days as number) >= 1 && (body.extend_days as number) <= 3660)) {
    return 'extend_days must be a whole number from 1 to 3660'
  }
  if (hasDate && !isText(body.expires_at, 40)) return 'expires_at must be an ISO date or datetime'
  if (body.source !== undefined && !isText(body.source, 50)) return 'source must be a string of at most 50 characters'

  return body as unknown as RenewRequest
}

function renewalResult(license: Pick<LicenseRow, 'license_key' | 'slug' | 'plan_code'>, renewal: LicenseRenewalRow, renewed: boolean) {
  return {
    renewed, // false when this reference was already applied: nothing changed, the earlier result is returned
    reference: renewal.reference,
    license_key: license.license_key,
    slug: license.slug,
    plan: license.plan_code,
    previous_expires_at: toIso(renewal.previous_expires_at),
    expires_at: toIso(renewal.new_expires_at),
  }
}

export const licenseRoutes = new Elysia({ prefix: '/license' })
  /**
   * Validate a license key from client.
   *
   * Checks:
   * 1. License exists and its status allows validation
   * 2. License is for this product (when the license names one)
   * 3. License not expired
   * 4. Machine count within limit
   *
   * Response is Ed25519-signed (signature field) with nonce echoed back.
   */
  .post(
    '/validate',
    ({ body, request }) => {
      const db = getDb()
      const clientIp = getClientIp(request)

      const resp = (fields: Omit<ValidateResult, 'nonce' | 'signature'>) =>
        signed({ nonce: body.nonce ?? '', ...fields })
      const log = (licenseId: string | null, result: string) =>
        logValidation(licenseId, body.license_key, body.machine_id, result, clientIp, {
          product: body.product,
          version: body.version,
          hostname: body.hostname,
          os_info: body.os_info,
        })

      // Find license
      const license = db.prepare('SELECT * FROM licenses WHERE license_key = ?').get(body.license_key) as
        | LicenseRow
        | undefined

      if (!license) {
        log(null, 'invalid')
        return resp({ valid: false, message: 'License key not found.' })
      }

      const status = db.prepare('SELECT * FROM license_statuses WHERE code = ?').get(license.status_code) as
        | LicenseStatusRow
        | undefined
      if (!status?.allows_validation) {
        log(license.id, 'inactive')
        return resp({ valid: false, message: 'License has been deactivated.' })
      }

      // Check expiry
      if (license.expires_at && Date.now() > dbToMs(license.expires_at)) {
        log(license.id, 'expired')
        return resp({ valid: false, expires_at: toIso(license.expires_at), message: 'License has expired.' })
      }

      // One row per machine id on a license; its status says whether it holds a slot
      const granted = transaction(() => {
        releaseStaleMachines(license.id)
        const now = nowDb()

        const machine = db
          .prepare('SELECT * FROM machine_activations WHERE license_id = ? AND machine_id = ?')
          .get(license.id, body.machine_id) as MachineActivationRow | undefined

        if (machine?.status_code === 'active') {
          // Known machine — update info
          db.prepare('UPDATE machine_activations SET last_seen = ?, hostname = ?, os_info = ?, ip_address = ? WHERE id = ?').run(
            now,
            body.hostname || machine.hostname,
            body.os_info || machine.os_info,
            clientIp || machine.ip_address,
            machine.id,
          )
          return true
        }

        // Same IP = same machine under a new id (e.g. a recreated container): it takes over that slot
        // instead of using another. The machine it replaces cannot do the same back while its
        // replacement is still checking in, so two live machines cannot share one slot.
        const holder = clientIp
          ? (db
              .prepare(
                `SELECT * FROM machine_activations
                 WHERE license_id = ? AND ip_address = ? AND status_code = 'active' ORDER BY last_seen DESC LIMIT 1`,
              )
              .get(license.id, clientIp) as MachineActivationRow | undefined)
          : undefined
        const mayTakeOver =
          holder && (machine?.status_code !== 'replaced' || Date.now() - dbToMs(holder.last_seen) >= RECLAIM_AFTER_MS)

        if (holder && mayTakeOver) {
          setMachineStatus(holder.id, 'replaced')
          console.info(`Machine re-identified by IP ${clientIp} on license ${license.id}.`)
        } else {
          const { n: activeMachines } = db
            .prepare("SELECT COUNT(id) AS n FROM machine_activations WHERE license_id = ? AND status_code = 'active'")
            .get(license.id) as { n: number }
          if (activeMachines >= license.max_machines) return false
        }

        if (machine) {
          // A machine seen before gets its row back
          db.prepare(
            `UPDATE machine_activations
             SET status_code = 'active', status_changed_at = ?, last_seen = ?, hostname = ?, os_info = ?, ip_address = ?
             WHERE id = ?`,
          ).run(now, now, body.hostname || machine.hostname, body.os_info || machine.os_info, clientIp || machine.ip_address, machine.id)
        } else {
          db.prepare(
            `INSERT INTO machine_activations
               (id, license_id, machine_id, status_code, hostname, os_info, ip_address, first_seen, last_seen, status_changed_at)
             VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)`,
          ).run(randomUUID(), license.id, body.machine_id, body.hostname ?? '', body.os_info ?? '', clientIp, now, now, now)
        }
        return true
      })

      if (!granted) {
        log(license.id, 'machine_limit')
        return resp({
          valid: false,
          message: `Machine limit reached (${license.max_machines}). Deactivate another machine first.`,
        })
      }

      // Valid!
      log(license.id, 'valid')

      return resp({
        valid: true,
        plan: license.plan_code,
        expires_at: toIso(license.expires_at),
        message: 'License valid.',
      })
    },
    { body: validateRequest },
  )

  /** Deactivate a machine from a license (free up slot). Holding the license key is the authorization. */
  .post(
    '/deactivate',
    ({ body }) => {
      const db = getDb()
      const license = db.prepare('SELECT id FROM licenses WHERE license_key = ?').get(body.license_key) as
        | Pick<LicenseRow, 'id'>
        | undefined
      if (!license) return { success: false, message: 'License not found.' }

      const { changes } = db
        .prepare(
          `UPDATE machine_activations SET status_code = 'deactivated', status_changed_at = ?
           WHERE license_id = ? AND machine_id = ? AND status_code = 'active'`,
        )
        .run(nowDb(), license.id, body.machine_id)
      if (changes) return { success: true, message: 'Machine deactivated.' }

      return { success: false, message: 'Machine not found or already deactivated.' }
    },
    { body: validateRequest },
  )

  /**
   * Extend a license. Called by another app (the chat app, after a payment), not by a person:
   * the request must carry an HMAC signature made with SECRET_KEY. See RENEWAL_TRIGGER_FROM_CHAT.md.
   */
  .post(
    '/renew',
    ({ body: raw, request, status }) => {
      if (settings.SECRET_KEY === DEFAULT_SECRET_KEY) {
        return status(503, { detail: 'Renewal is disabled until SECRET_KEY is set.' })
      }
      const signature = verifyHmacSignature(request, raw, true)
      if (!signature.ok) return status(401, { detail: signature.detail })

      const body = parseRenewRequest(raw)
      if (typeof body === 'string') return status(422, { detail: body })

      const db = getDb()

      // The same reference again (a retried webhook) must not extend twice
      const findApplied = () =>
        db.prepare('SELECT * FROM license_renewals WHERE reference = ?').get(body.reference) as LicenseRenewalRow | undefined
      const applied = findApplied()
      if (applied) {
        const license = db.prepare('SELECT * FROM licenses WHERE id = ?').get(applied.license_id) as unknown as LicenseRow
        return renewalResult(license, applied, false)
      }

      let license: LicenseRow | undefined
      if (body.license_key) {
        license = db.prepare('SELECT * FROM licenses WHERE license_key = ?').get(body.license_key) as LicenseRow | undefined
      } else {
        // A slug may carry old revoked licenses; exactly one live license must answer to it
        const matches = db
          .prepare("SELECT * FROM licenses WHERE slug = ? AND status_code = 'active'")
          .all(body.slug!) as unknown as LicenseRow[]
        if (matches.length > 1) {
          return status(409, { detail: 'More than one active license has this slug. Renew by license_key instead.' })
        }
        license = matches[0]
      }
      if (!license) return status(404, { detail: 'License not found.' })
      if (license.status_code !== 'active') return status(409, { detail: 'License is revoked and cannot be renewed.' })
      if (!license.expires_at) return status(409, { detail: 'License has no expiry date (lifetime).' })

      let newExpiry: string | null
      if (body.extend_days) {
        // Time left is kept: an unexpired license extends from its expiry, an expired one from now
        const from = Math.max(Date.now(), dbToMs(license.expires_at))
        newExpiry = toDb(new Date(from + body.extend_days * 86_400_000))
      } else {
        newExpiry = parseIso(body.expires_at!, 'end')
        if (!newExpiry) return status(422, { detail: 'Invalid expires_at. Use ISO format.' })
        if (dbToMs(newExpiry) <= Date.now()) return status(422, { detail: 'expires_at must be in the future.' })
      }

      const renewal: LicenseRenewalRow = {
        id: randomUUID(),
        license_id: license.id,
        reference: body.reference,
        source: body.source ?? null,
        extend_days: body.extend_days ?? null,
        previous_expires_at: license.expires_at,
        new_expires_at: newExpiry,
        created_at: nowDb(),
      }
      transaction(() => {
        db.prepare(
          `INSERT INTO license_renewals
             (id, license_id, reference, source, extend_days, previous_expires_at, new_expires_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          renewal.id, renewal.license_id, renewal.reference, renewal.source, renewal.extend_days,
          renewal.previous_expires_at, renewal.new_expires_at, renewal.created_at,
        )
        db.prepare('UPDATE licenses SET expires_at = ?, updated_at = ? WHERE id = ?').run(newExpiry, renewal.created_at, license.id)
      })

      return renewalResult(license, renewal, true)
    },
    { parse: 'text', body: t.String() },
  )
