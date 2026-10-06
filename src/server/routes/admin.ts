/** Admin endpoints for managing licenses (multi-app). Every route requires a valid admin JWT. */
import { randomBytes, randomUUID } from 'node:crypto'
import { Elysia, t } from 'elysia'

import { decodeToken } from '../auth'
import { getDb, type LicenseRow, type MachineActivationRow, type ValidationLogRow } from '../db'
import { nowDb, parseIso, toDb, toIso } from '../time'

function toDict(license: LicenseRow) {
  return {
    id: license.id,
    license_key: license.license_key,
    customer_name: license.customer_name,
    customer_email: license.customer_email,
    plan: license.plan,
    product: license.product,
    max_machines: license.max_machines,
    is_active: !!license.is_active,
    expires_at: toIso(license.expires_at),
    created_at: toIso(license.created_at),
  }
}

function findLicense(licenseId: string) {
  return getDb().prepare('SELECT * FROM licenses WHERE id = ?').get(licenseId) as LicenseRow | undefined
}

function count(sql: string, ...params: string[]): number {
  return (getDb().prepare(sql).get(...params) as { n: number }).n
}

const keyPart = () => randomBytes(4).toString('hex').toUpperCase()

export const adminRoutes = new Elysia({ prefix: '/admin' })
  // Require valid admin JWT
  .onBeforeHandle(async ({ headers, set, status }) => {
    const token = /^Bearer\s+(.+)$/i.exec(headers.authorization ?? '')?.[1]
    if (!token) {
      set.headers['www-authenticate'] = 'Bearer'
      return status(401, { detail: 'Authentication required' })
    }

    const payload = await decodeToken(token)
    if (!payload) {
      set.headers['www-authenticate'] = 'Bearer'
      return status(401, { detail: 'Invalid or expired token' })
    }
    if (!payload.sub) return status(401, { detail: 'Invalid token payload' })
  })

  /** Create a new license key. */
  .post(
    '/licenses',
    ({ body, status }) => {
      // Generate unique license key: PREFIX-XXXX-XXXX-XXXX (prefix = product name uppercase)
      const prefix = body.product.toUpperCase().replaceAll(' ', '').slice(0, 6)
      const licenseKey = `${prefix}-${keyPart()}-${keyPart()}-${keyPart()}`

      let expiresAt: string | null = null
      if (body.expires_at) {
        expiresAt = parseIso(body.expires_at)
        if (!expiresAt) return status(400, { detail: 'Invalid expires_at. Use ISO format.' })
      }

      const id = randomUUID()
      const now = nowDb()
      const plan = body.plan ?? 'starter'
      const maxMachines = body.max_machines ?? 1
      getDb()
        .prepare(
          `INSERT INTO licenses
             (id, license_key, customer_name, customer_email, plan, product, max_machines,
              is_active, expires_at, created_at, updated_at, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
        )
        .run(
          id, licenseKey, body.customer_name, body.customer_email, plan, body.product, maxMachines,
          expiresAt, now, now, body.notes ?? null,
        )

      return status(201, {
        id,
        license_key: licenseKey,
        customer_name: body.customer_name,
        customer_email: body.customer_email,
        plan,
        product: body.product,
        max_machines: maxMachines,
        is_active: true,
        expires_at: body.expires_at ?? null,
        created_at: toIso(now),
        active_machines: 0,
      })
    },
    {
      body: t.Object({
        customer_name: t.String(),
        customer_email: t.String(),
        plan: t.Optional(t.String()), // starter, pro, enterprise
        product: t.String(), // required — specify which app this license is for
        max_machines: t.Optional(t.Integer()),
        expires_at: t.Optional(t.Nullable(t.String())), // ISO format, null = lifetime
        notes: t.Optional(t.Nullable(t.String())),
      }),
    },
  )

  /** List all licenses. */
  .get(
    '/licenses',
    ({ query }) => {
      const page = query.page ?? 1
      const perPage = query.per_page ?? 50
      const where = query.active_only ? 'WHERE is_active = 1' : ''

      const total = count(`SELECT COUNT(id) AS n FROM licenses ${where}`)
      const licenses = getDb()
        .prepare(`SELECT * FROM licenses ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
        .all(perPage, (page - 1) * perPage) as unknown as LicenseRow[]

      return { total, page, data: licenses.map(toDict) }
    },
    {
      query: t.Object({
        page: t.Optional(t.Numeric()),
        per_page: t.Optional(t.Numeric()),
        active_only: t.Optional(t.BooleanString()),
      }),
    },
  )

  /** Get license details with machine activations. */
  .get('/licenses/:license_id', ({ params, status }) => {
    const license = findLicense(params.license_id)
    if (!license) return status(404, { detail: 'License not found.' })

    const machines = getDb()
      .prepare('SELECT * FROM machine_activations WHERE license_id = ?')
      .all(params.license_id) as unknown as MachineActivationRow[]

    return {
      ...toDict(license),
      machines: machines.map((m) => ({
        id: m.id,
        machine_id: m.machine_id,
        hostname: m.hostname,
        os_info: m.os_info,
        ip_address: m.ip_address,
        first_seen: toIso(m.first_seen),
        last_seen: toIso(m.last_seen),
        is_active: !!m.is_active,
      })),
    }
  })

  /** Update license properties. */
  .patch(
    '/licenses/:license_id',
    ({ params, body, status }) => {
      const license = findLicense(params.license_id)
      if (!license) return status(404, { detail: 'License not found.' })

      if (body.is_active != null) license.is_active = body.is_active ? 1 : 0
      if (body.plan != null) license.plan = body.plan
      if (body.max_machines != null) license.max_machines = body.max_machines
      if (body.expires_at != null) {
        const expiresAt = parseIso(body.expires_at)
        if (!expiresAt) return status(400, { detail: 'Invalid expires_at. Use ISO format.' })
        license.expires_at = expiresAt
      }
      if (body.notes != null) license.notes = body.notes

      getDb()
        .prepare(
          `UPDATE licenses SET is_active = ?, plan = ?, max_machines = ?, expires_at = ?, notes = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(license.is_active, license.plan, license.max_machines, license.expires_at, license.notes, nowDb(), license.id)

      return toDict(license)
    },
    {
      body: t.Object({
        is_active: t.Optional(t.Nullable(t.Boolean())),
        plan: t.Optional(t.Nullable(t.String())),
        max_machines: t.Optional(t.Nullable(t.Integer())),
        expires_at: t.Optional(t.Nullable(t.String())),
        notes: t.Optional(t.Nullable(t.String())),
      }),
    },
  )

  /** Revoke (deactivate) a license. */
  .delete('/licenses/:license_id', ({ params, status }) => {
    const license = findLicense(params.license_id)
    if (!license) return status(404, { detail: 'License not found.' })

    getDb().prepare('UPDATE licenses SET is_active = 0, updated_at = ? WHERE id = ?').run(nowDb(), license.id)
    return { revoked: true }
  })

  /** Get license system statistics. */
  .get('/stats', () => {
    const todayStart = new Date()
    todayStart.setUTCHours(0, 0, 0, 0)

    return {
      total_licenses: count('SELECT COUNT(id) AS n FROM licenses'),
      active_licenses: count('SELECT COUNT(id) AS n FROM licenses WHERE is_active = 1'),
      total_validations_today: count('SELECT COUNT(id) AS n FROM validation_logs WHERE timestamp >= ?', toDb(todayStart)),
      total_machines: count('SELECT COUNT(id) AS n FROM machine_activations WHERE is_active = 1'),
    }
  })

  /** Get recent validation logs. */
  .get(
    '/validation-logs',
    ({ query }) => {
      const logs = getDb()
        .prepare('SELECT * FROM validation_logs ORDER BY timestamp DESC LIMIT ? OFFSET ?')
        .all(query.limit ?? 50, query.offset ?? 0) as unknown as ValidationLogRow[]

      return logs.map((log) => ({
        id: log.id,
        license_id: log.license_id,
        license_key: log.license_key,
        machine_id: log.machine_id,
        result: log.result,
        ip_address: log.ip_address,
        timestamp: toIso(log.timestamp),
      }))
    },
    { query: t.Object({ limit: t.Optional(t.Numeric()), offset: t.Optional(t.Numeric()) }) },
  )
