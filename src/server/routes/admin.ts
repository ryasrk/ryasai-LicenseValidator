/** Admin endpoints for managing licenses (multi-app). Every route requires a valid admin JWT. */
import { randomBytes, randomUUID } from 'node:crypto'
import { Elysia, t } from 'elysia'

import { authenticate, findAdminByEmail, hashPassword, verifyPassword } from '../auth'
import {
  getDb,
  likePattern,
  type AdminUserRow,
  type LicensePlanRow,
  type LicenseRenewalRow,
  type LicenseRow,
  type LicenseStatusRow,
  type MachineActivationRow,
  type MachineStatusRow,
  type ValidationLogRow,
  type ValidationResultRow,
} from '../db'
import { dbToMs, nowDb, parseIso, toDb, toIso } from '../time'
import { releaseStaleMachines } from './license'

type SqlValue = string | number | null

const isExpired = (license: Pick<LicenseRow, 'expires_at'>) => !!license.expires_at && Date.now() > dbToMs(license.expires_at)

function toDict(license: LicenseRow) {
  return {
    id: license.id,
    license_key: license.license_key,
    customer_name: license.customer_name,
    customer_email: license.customer_email,
    plan: license.plan_code,
    product: license.product,
    slug: license.slug,
    max_machines: license.max_machines,
    status: license.status_code,
    is_active: license.status_code === 'active',
    is_expired: isExpired(license),
    expires_at: toIso(license.expires_at),
    created_at: toIso(license.created_at),
    updated_at: toIso(license.updated_at),
    notes: license.notes,
  }
}

function adminToDict(admin: AdminUserRow) {
  return { id: admin.id, email: admin.email, is_active: !!admin.is_active, created_at: toIso(admin.created_at) }
}

function findLicense(licenseId: string) {
  return getDb().prepare('SELECT * FROM licenses WHERE id = ?').get(licenseId) as LicenseRow | undefined
}

function count(sql: string, ...params: SqlValue[]): number {
  return (getDb().prepare(sql).get(...params) as { n: number }).n
}

const masterExists = (table: 'license_plans' | 'license_statuses' | 'validation_results', code: string) =>
  !!getDb().prepare(`SELECT 1 FROM ${table} WHERE code = ?`).get(code)

const activeAdmins = () => count('SELECT COUNT(id) AS n FROM admin_users WHERE is_active = 1')

const keyPart = () => randomBytes(4).toString('hex').toUpperCase()

export function generateLicenseKey(product?: string): string {
  const p = product?.trim() ?? ''
  const prefix = p.toUpperCase().replaceAll(' ', '').slice(0, 6) || 'RYASAI'
  return `${prefix}-${keyPart()}-${keyPart()}-${keyPart()}`
}

/** A paging number kept inside its range (the query schema only guarantees it is numeric). */
function clamp(value: number | undefined, fallback: number, min: number, max: number): number {
  const n = Math.trunc(Number(value ?? fallback))
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

/** Empty or blank text from a form means "not set". */
const blankToNull = (value: string | null | undefined) => value?.trim() || null

const name = t.String({ minLength: 1, maxLength: 200 })
const password = t.String({ minLength: 8, maxLength: 200 })

export const adminRoutes = new Elysia({ prefix: '/admin' })
  // Require a valid token of an admin that still exists and is active
  .resolve(async ({ headers, set, status }) => {
    const token = /^Bearer\s+(.+)$/i.exec(headers.authorization ?? '')?.[1]
    const admin = token ? await authenticate(token) : null
    if (!admin) {
      set.headers['www-authenticate'] = 'Bearer'
      return status(401, { detail: token ? 'Invalid or expired token' : 'Authentication required' })
    }
    return { admin }
  })

  /** Master data: the codes a license plan, a status and a validation result can take. */
  .get('/meta', () => {
    const db = getDb()
    return {
      plans: (db.prepare('SELECT * FROM license_plans ORDER BY sort_order, code').all() as unknown as LicensePlanRow[]).map(
        ({ code, name, description }) => ({ code, name, description }),
      ),
      license_statuses: (
        db.prepare('SELECT * FROM license_statuses ORDER BY sort_order, code').all() as unknown as LicenseStatusRow[]
      ).map(({ code, name, description, allows_validation }) => ({ code, name, description, allows_validation: !!allows_validation })),
      machine_statuses: (
        db.prepare('SELECT * FROM machine_statuses ORDER BY sort_order, code').all() as unknown as MachineStatusRow[]
      ).map(({ code, name, description, occupies_slot }) => ({ code, name, description, occupies_slot: !!occupies_slot })),
      validation_results: (
        db.prepare('SELECT * FROM validation_results ORDER BY sort_order, code').all() as unknown as ValidationResultRow[]
      ).map(({ code, name, description, is_success }) => ({ code, name, description, is_success: !!is_success })),
    }
  })

  /** Create a new license key. */
  .post(
    '/licenses',
    ({ body, status }) => {
      const product = body.product?.trim() ?? ''
      const licenseKey = generateLicenseKey(product)

      const plan = body.plan ?? 'starter'
      if (!masterExists('license_plans', plan)) return status(400, { detail: `Unknown plan "${plan}".` })

      let expiresAt: string | null = null
      if (body.expires_at) {
        expiresAt = parseIso(body.expires_at, 'end')
        if (!expiresAt) return status(400, { detail: 'Invalid expires_at. Use ISO format.' })
      }

      const license: LicenseRow = {
        id: randomUUID(),
        license_key: licenseKey,
        customer_name: body.customer_name.trim(),
        customer_email: body.customer_email.trim(),
        plan_code: plan,
        status_code: 'active',
        product,
        slug: blankToNull(body.slug),
        max_machines: body.max_machines ?? 1,
        expires_at: expiresAt,
        created_at: nowDb(),
        updated_at: nowDb(),
        notes: blankToNull(body.notes),
      }
      getDb()
        .prepare(
          `INSERT INTO licenses
             (id, license_key, customer_name, customer_email, plan_code, status_code, product, slug,
              max_machines, expires_at, created_at, updated_at, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          license.id, license.license_key, license.customer_name, license.customer_email, license.plan_code,
          license.status_code, license.product, license.slug, license.max_machines, license.expires_at,
          license.created_at, license.updated_at, license.notes,
        )

      return status(201, { ...toDict(license), active_machines: 0 })
    },
    {
      body: t.Object({
        customer_name: name,
        customer_email: name,
        plan: t.Optional(t.String({ maxLength: 20 })), // a license_plans code
        product: t.Optional(t.String({ maxLength: 50 })), // app the license is for; omitted or '' = any app
        slug: t.Optional(t.Nullable(t.String({ maxLength: 100 }))),
        max_machines: t.Optional(t.Integer({ minimum: 1, maximum: 100000 })),
        expires_at: t.Optional(t.Nullable(t.String({ maxLength: 40 }))), // ISO format, null = lifetime
        notes: t.Optional(t.Nullable(t.String({ maxLength: 5000 }))),
      }),
    },
  )

  /** List licenses. */
  .get(
    '/licenses',
    ({ query }) => {
      const page = clamp(query.page, 1, 1, Number.MAX_SAFE_INTEGER)
      const perPage = clamp(query.per_page, 50, 1, 200)
      const conditions: string[] = []
      const params: SqlValue[] = []
      const now = nowDb()

      // "active" here means usable right now; an expired license is its own state
      const state = query.state ?? (query.active_only ? 'not_revoked' : undefined)
      if (state === 'not_revoked') conditions.push("status_code = 'active'")
      if (state === 'active') {
        conditions.push("status_code = 'active' AND (expires_at IS NULL OR expires_at >= ?)")
        params.push(now)
      }
      if (state === 'expired') {
        conditions.push("status_code = 'active' AND expires_at < ?")
        params.push(now)
      }
      if (state === 'revoked') conditions.push("status_code = 'revoked'")

      if (query.plan) {
        conditions.push('plan_code = ?')
        params.push(query.plan)
      }
      if (query.slug) {
        conditions.push('slug = ?')
        params.push(query.slug)
      }
      const search = query.search?.trim()
      if (search) {
        const pattern = likePattern(search)
        conditions.push(
          `(customer_name LIKE ? ESCAPE '\\' OR customer_email LIKE ? ESCAPE '\\' OR license_key LIKE ? ESCAPE '\\' OR slug LIKE ? ESCAPE '\\')`,
        )
        params.push(pattern, pattern, pattern, pattern)
      }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

      const total = count(`SELECT COUNT(id) AS n FROM licenses ${where}`, ...params)
      const licenses = getDb()
        .prepare(
          `SELECT licenses.*,
                  (SELECT COUNT(id) FROM machine_activations m WHERE m.license_id = licenses.id AND m.status_code = 'active') AS active_machines
           FROM licenses ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        )
        .all(...params, perPage, (page - 1) * perPage) as unknown as (LicenseRow & { active_machines: number })[]

      return { total, page, data: licenses.map((license) => ({ ...toDict(license), active_machines: license.active_machines })) }
    },
    {
      query: t.Object({
        page: t.Optional(t.Numeric()),
        per_page: t.Optional(t.Numeric()), // 1 to 200
        active_only: t.Optional(t.BooleanString()), // older name for state=not_revoked
        state: t.Optional(t.Union([t.Literal('active'), t.Literal('expired'), t.Literal('revoked'), t.Literal('not_revoked')])),
        plan: t.Optional(t.String({ maxLength: 20 })),
        slug: t.Optional(t.String({ maxLength: 100 })),
        search: t.Optional(t.String({ maxLength: 200 })),
      }),
    },
  )

  /** Get license details with machine activations and renewals. */
  .get('/licenses/:license_id', ({ params, status }) => {
    const license = findLicense(params.license_id)
    if (!license) return status(404, { detail: 'License not found.' })

    releaseStaleMachines(license.id)
    const machines = getDb()
      .prepare("SELECT * FROM machine_activations WHERE license_id = ? ORDER BY status_code = 'active' DESC, last_seen DESC")
      .all(params.license_id) as unknown as MachineActivationRow[]
    const renewals = getDb()
      .prepare('SELECT * FROM license_renewals WHERE license_id = ? ORDER BY created_at DESC')
      .all(params.license_id) as unknown as LicenseRenewalRow[]

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
        status: m.status_code,
        is_active: m.status_code === 'active',
      })),
      renewals: renewals.map((r) => ({
        id: r.id,
        reference: r.reference,
        source: r.source,
        extend_days: r.extend_days,
        previous_expires_at: toIso(r.previous_expires_at),
        expires_at: toIso(r.new_expires_at),
        created_at: toIso(r.created_at),
      })),
    }
  })

  /** Update license properties. Only the fields sent are changed. */
  .patch(
    '/licenses/:license_id',
    ({ params, body, status }) => {
      const license = findLicense(params.license_id)
      if (!license) return status(404, { detail: 'License not found.' })

      if (body.customer_name != null) license.customer_name = body.customer_name.trim()
      if (body.customer_email != null) license.customer_email = body.customer_email.trim()
      if (body.is_active != null) license.status_code = body.is_active ? 'active' : 'revoked'
      if (body.status != null) {
        if (!masterExists('license_statuses', body.status)) return status(400, { detail: `Unknown status "${body.status}".` })
        license.status_code = body.status
      }
      if (body.plan != null) {
        if (!masterExists('license_plans', body.plan)) return status(400, { detail: `Unknown plan "${body.plan}".` })
        license.plan_code = body.plan
      }
      if (body.product != null) license.product = body.product.trim()
      if (body.max_machines != null) license.max_machines = body.max_machines
      // These three can be emptied: null (or blank text) clears them
      if (body.slug !== undefined) license.slug = blankToNull(body.slug)
      if (body.notes !== undefined) license.notes = blankToNull(body.notes)
      if (body.expires_at !== undefined) {
        if (body.expires_at === null || !body.expires_at.trim()) {
          license.expires_at = null
        } else {
          const expiresAt = parseIso(body.expires_at, 'end')
          if (!expiresAt) return status(400, { detail: 'Invalid expires_at. Use ISO format.' })
          license.expires_at = expiresAt
        }
      }
      license.updated_at = nowDb()

      getDb()
        .prepare(
          `UPDATE licenses
           SET customer_name = ?, customer_email = ?, status_code = ?, plan_code = ?, product = ?, slug = ?,
               max_machines = ?, expires_at = ?, notes = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(
          license.customer_name, license.customer_email, license.status_code, license.plan_code, license.product,
          license.slug, license.max_machines, license.expires_at, license.notes, license.updated_at, license.id,
        )

      return toDict(license)
    },
    {
      body: t.Object({
        customer_name: t.Optional(name),
        customer_email: t.Optional(name),
        is_active: t.Optional(t.Nullable(t.Boolean())),
        status: t.Optional(t.String({ maxLength: 20 })), // a license_statuses code
        plan: t.Optional(t.Nullable(t.String({ maxLength: 20 }))),
        product: t.Optional(t.String({ maxLength: 50 })),
        slug: t.Optional(t.Nullable(t.String({ maxLength: 100 }))),
        max_machines: t.Optional(t.Nullable(t.Integer({ minimum: 1, maximum: 100000 }))),
        expires_at: t.Optional(t.Nullable(t.String({ maxLength: 40 }))), // null = lifetime
        notes: t.Optional(t.Nullable(t.String({ maxLength: 5000 }))),
      }),
    },
  )

  /** Revoke (deactivate) a license, or with ?permanent=true delete it with its machines and renewals. */
  .delete(
    '/licenses/:license_id',
    ({ params, query, status }) => {
      const license = findLicense(params.license_id)
      if (!license) return status(404, { detail: 'License not found.' })

      if (query.permanent) {
        // Machines and renewals go with it; its validation logs stay, without the link
        getDb().prepare('DELETE FROM licenses WHERE id = ?').run(license.id)
        return { revoked: true, deleted: true }
      }

      getDb().prepare("UPDATE licenses SET status_code = 'revoked', updated_at = ? WHERE id = ?").run(nowDb(), license.id)
      return { revoked: true, deleted: false }
    },
    { query: t.Object({ permanent: t.Optional(t.BooleanString()) }) },
  )

  /** Take a machine off a license, freeing its slot. machine_id is the row id from the license details. */
  .delete('/licenses/:license_id/machines/:machine_id', ({ params, status }) => {
    const { changes } = getDb()
      .prepare(
        `UPDATE machine_activations SET status_code = 'deactivated', status_changed_at = ?
         WHERE id = ? AND license_id = ? AND status_code = 'active'`,
      )
      .run(nowDb(), params.machine_id, params.license_id)
    if (!changes) return status(404, { detail: 'Active machine not found on this license.' })
    return { deactivated: true }
  })

  /** Get license system statistics. */
  .get('/stats', () => {
    const todayStart = new Date()
    todayStart.setUTCHours(0, 0, 0, 0)

    return {
      total_licenses: count('SELECT COUNT(id) AS n FROM licenses'),
      active_licenses: count("SELECT COUNT(id) AS n FROM licenses WHERE status_code = 'active'"),
      total_validations_today: count('SELECT COUNT(id) AS n FROM validation_logs WHERE timestamp >= ?', toDb(todayStart)),
      // Machines holding a slot on a license that is not revoked
      total_machines: count(
        `SELECT COUNT(m.id) AS n FROM machine_activations m JOIN licenses l ON l.id = m.license_id
         WHERE m.status_code = 'active' AND l.status_code = 'active'`,
      ),
    }
  })

  /** Get validation logs, newest first. */
  .get(
    '/validation-logs',
    ({ query, status }) => {
      const limit = clamp(query.limit, 50, 1, 500)
      const offset = clamp(query.offset, 0, 0, Number.MAX_SAFE_INTEGER)
      const conditions: string[] = []
      const params: SqlValue[] = []

      if (query.result) {
        conditions.push('result_code = ?')
        params.push(query.result)
      }
      if (query.license_id) {
        conditions.push('license_id = ?')
        params.push(query.license_id)
      }
      if (query.from) {
        const from = parseIso(query.from, 'start')
        if (!from) return status(400, { detail: 'Invalid from. Use ISO format.' })
        conditions.push('timestamp >= ?')
        params.push(from)
      }
      if (query.to) {
        const to = parseIso(query.to, 'end')
        if (!to) return status(400, { detail: 'Invalid to. Use ISO format.' })
        conditions.push('timestamp <= ?')
        params.push(to)
      }
      const search = query.search?.trim()
      if (search) {
        const pattern = likePattern(search)
        conditions.push(`(license_key LIKE ? ESCAPE '\\' OR machine_id LIKE ? ESCAPE '\\' OR ip_address LIKE ? ESCAPE '\\')`)
        params.push(pattern, pattern, pattern)
      }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

      const total = count(`SELECT COUNT(id) AS n FROM validation_logs ${where}`, ...params)
      const logs = getDb()
        .prepare(`SELECT * FROM validation_logs ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`)
        .all(...params, limit, offset) as unknown as ValidationLogRow[]

      return {
        total,
        limit,
        offset,
        data: logs.map((log) => ({
          id: log.id,
          license_id: log.license_id,
          license_key: log.license_key,
          machine_id: log.machine_id,
          result: log.result_code,
          ip_address: log.ip_address,
          timestamp: toIso(log.timestamp),
          metadata: log.metadata ? (JSON.parse(log.metadata) as Record<string, string>) : null,
        })),
      }
    },
    {
      query: t.Object({
        limit: t.Optional(t.Numeric()), // 1 to 500
        offset: t.Optional(t.Numeric()),
        result: t.Optional(t.String({ maxLength: 20 })), // a validation_results code
        license_id: t.Optional(t.String({ maxLength: 36 })),
        from: t.Optional(t.String({ maxLength: 40 })), // ISO; a date alone is the start of that day (UTC)
        to: t.Optional(t.String({ maxLength: 40 })), // ISO; a date alone is the end of that day (UTC)
        search: t.Optional(t.String({ maxLength: 200 })), // in license key, machine id or IP address
      }),
    },
  )

  // ─── Admin accounts ────────────────────────────────────────────────────────

  /** The signed-in admin. */
  .get('/me', ({ admin }) => adminToDict(admin))

  /** Change your own password. Every token issued before stops working; a new one is not issued here. */
  .post(
    '/me/password',
    async ({ admin, body, status }) => {
      if (!(await verifyPassword(body.current_password, admin.password_hash))) {
        return status(400, { detail: 'Current password is incorrect.' })
      }
      getDb()
        .prepare('UPDATE admin_users SET password_hash = ?, token_version = token_version + 1, updated_at = ? WHERE id = ?')
        .run(await hashPassword(body.new_password), nowDb(), admin.id)
      return { changed: true }
    },
    { body: t.Object({ current_password: t.String({ maxLength: 200 }), new_password: password }) },
  )

  /** List admin accounts. */
  .get('/users', () =>
    (getDb().prepare('SELECT * FROM admin_users ORDER BY created_at').all() as unknown as AdminUserRow[]).map(adminToDict),
  )

  /** Add an admin account. */
  .post(
    '/users',
    async ({ body, status }) => {
      const email = body.email.trim()
      if (!/^\S+@\S+\.\S+$/.test(email)) return status(400, { detail: 'Enter a valid email address.' })
      if (findAdminByEmail(email)) return status(409, { detail: 'An admin with this email already exists.' })

      const admin: AdminUserRow = {
        id: randomUUID(),
        email,
        password_hash: await hashPassword(body.password),
        is_active: 1,
        token_version: 0,
        created_at: nowDb(),
        updated_at: null,
      }
      getDb()
        .prepare('INSERT INTO admin_users (id, email, password_hash, is_active, created_at) VALUES (?, ?, ?, 1, ?)')
        .run(admin.id, admin.email, admin.password_hash, admin.created_at)
      return status(201, adminToDict(admin))
    },
    { body: t.Object({ email: t.String({ maxLength: 200 }), password }) },
  )

  /** Deactivate or reactivate an admin, or set a new password for them. Either signs them out everywhere. */
  .patch(
    '/users/:user_id',
    async ({ admin, params, body, status }) => {
      const target = getDb().prepare('SELECT * FROM admin_users WHERE id = ?').get(params.user_id) as AdminUserRow | undefined
      if (!target) return status(404, { detail: 'Admin not found.' })

      if (body.is_active === false && target.is_active) {
        if (target.id === admin.id) return status(400, { detail: 'You cannot deactivate your own account.' })
        if (activeAdmins() <= 1) return status(400, { detail: 'At least one admin must stay active.' })
      }
      if (body.is_active != null) target.is_active = body.is_active ? 1 : 0
      if (body.password != null) target.password_hash = await hashPassword(body.password)

      getDb()
        .prepare(
          'UPDATE admin_users SET is_active = ?, password_hash = ?, token_version = token_version + 1, updated_at = ? WHERE id = ?',
        )
        .run(target.is_active, target.password_hash, nowDb(), target.id)
      return adminToDict(target)
    },
    { body: t.Object({ is_active: t.Optional(t.Boolean()), password: t.Optional(password) }) },
  )
