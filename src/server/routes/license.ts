/** License validation endpoints — called by client apps. */
import { createPrivateKey, randomUUID, sign, type KeyObject } from 'node:crypto'
import { Elysia, t } from 'elysia'

import { settings } from '../config'
import { getDb, type LicenseRow, type MachineActivationRow } from '../db'
import { getClientIp } from '../middleware'
import { dbToMs, nowDb, toIso } from '../time'

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

/** Log validation attempt. */
function logValidation(licenseId: string | null, licenseKey: string, machineId: string, result: string, ip: string | null) {
  getDb()
    .prepare(
      `INSERT INTO validation_logs (id, license_id, license_key, machine_id, result, ip_address, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(randomUUID(), licenseId, licenseKey, machineId, result, ip, nowDb())
}

const validateRequest = t.Object({
  license_key: t.String(),
  machine_id: t.String(),
  product: t.String(), // required — app must identify itself
  version: t.Optional(t.String()),
  hostname: t.Optional(t.String()),
  os_info: t.Optional(t.String()),
  nonce: t.Optional(t.String()), // client-generated random hex, echoed back in response
})

export const licenseRoutes = new Elysia({ prefix: '/license' })
  /**
   * Validate a license key from client.
   *
   * Checks:
   * 1. License exists and is active
   * 2. License not expired
   * 3. Machine count within limit
   *
   * Response is Ed25519-signed (signature field) with nonce echoed back.
   */
  .post(
    '/validate',
    ({ body, request }) => {
      const db = getDb()
      const clientIp = getClientIp(request)
      const hostname = body.hostname ?? ''
      const osInfo = body.os_info ?? ''

      const resp = (fields: Omit<ValidateResult, 'nonce' | 'signature'>) =>
        signed({ nonce: body.nonce ?? '', ...fields })
      const log = (licenseId: string | null, result: string) =>
        logValidation(licenseId, body.license_key, body.machine_id, result, clientIp)

      // Find license
      const license = db.prepare('SELECT * FROM licenses WHERE license_key = ?').get(body.license_key) as
        | LicenseRow
        | undefined

      if (!license) {
        log(null, 'invalid')
        return resp({ valid: false, message: 'License key not found.' })
      }

      if (!license.is_active) {
        log(license.id, 'inactive')
        return resp({ valid: false, message: 'License has been deactivated.' })
      }

      // Check product match
      if (license.product !== body.product) {
        log(license.id, 'wrong_product')
        return resp({ valid: false, message: 'License not valid for this product.' })
      }

      // Check expiry
      if (license.expires_at && Date.now() > dbToMs(license.expires_at)) {
        log(license.id, 'expired')
        return resp({ valid: false, expires_at: toIso(license.expires_at), message: 'License has expired.' })
      }

      // Check machine limit
      const { n: activeMachines } = db
        .prepare('SELECT COUNT(id) AS n FROM machine_activations WHERE license_id = ? AND is_active = 1')
        .get(license.id) as { n: number }

      // Check if this machine is already registered (by machine_id)
      const machine = db
        .prepare('SELECT * FROM machine_activations WHERE license_id = ? AND machine_id = ? AND is_active = 1')
        .get(license.id, body.machine_id) as MachineActivationRow | undefined

      // Also check by IP — same IP = same machine (handles container recreate / machine_id change)
      const machineByIp =
        !machine && clientIp
          ? (db
              .prepare('SELECT * FROM machine_activations WHERE license_id = ? AND ip_address = ? AND is_active = 1')
              .get(license.id, clientIp) as MachineActivationRow | undefined)
          : undefined

      if (machine) {
        // Exact machine_id match — update info
        db.prepare('UPDATE machine_activations SET last_seen = ?, hostname = ?, os_info = ?, ip_address = ? WHERE id = ?').run(
          nowDb(),
          hostname || machine.hostname,
          osInfo || machine.os_info,
          clientIp || machine.ip_address,
          machine.id,
        )
      } else if (machineByIp) {
        // Same IP, different machine_id — treat as same machine (e.g. container recreated)
        db.prepare('UPDATE machine_activations SET machine_id = ?, last_seen = ?, hostname = ?, os_info = ? WHERE id = ?').run(
          body.machine_id,
          nowDb(),
          hostname || machineByIp.hostname,
          osInfo || machineByIp.os_info,
          machineByIp.id,
        )
        console.info(`Machine re-identified by IP ${clientIp}. Updated machine_id.`)
      } else {
        // Truly new machine - check limit
        if (activeMachines >= license.max_machines) {
          log(license.id, 'machine_limit')
          return resp({
            valid: false,
            message: `Machine limit reached (${license.max_machines}). Deactivate another machine first.`,
          })
        }

        // Register new machine
        const now = nowDb()
        db.prepare(
          `INSERT INTO machine_activations
             (id, license_id, machine_id, hostname, os_info, ip_address, first_seen, last_seen, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        ).run(randomUUID(), license.id, body.machine_id, hostname, osInfo, clientIp, now, now)
      }

      // Valid!
      log(license.id, 'valid')

      return resp({
        valid: true,
        plan: license.plan,
        expires_at: toIso(license.expires_at),
        message: 'License valid.',
      })
    },
    { body: validateRequest },
  )

  /** Deactivate a machine from a license (free up slot). */
  .post(
    '/deactivate',
    ({ body }) => {
      const db = getDb()
      const license = db.prepare('SELECT id FROM licenses WHERE license_key = ?').get(body.license_key) as
        | Pick<LicenseRow, 'id'>
        | undefined
      if (!license) return { success: false, message: 'License not found.' }

      const { changes } = db
        .prepare('UPDATE machine_activations SET is_active = 0 WHERE license_id = ? AND machine_id = ? AND is_active = 1')
        .run(license.id, body.machine_id)
      if (changes) return { success: true, message: 'Machine deactivated.' }

      return { success: false, message: 'Machine not found or already deactivated.' }
    },
    { body: validateRequest },
  )
