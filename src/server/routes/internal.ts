/** Internal server-to-server endpoints (shared-secret auth, NOT admin JWT). */
import { randomUUID } from 'node:crypto'
import { Elysia, t } from 'elysia'

import { settings } from '../config'
import { getDb, type LicenseRow } from '../db'
import { generateLicenseKey } from './admin'
import { nowDb } from '../time'

const ALLOWED_MONTHS = new Set([1, 3, 6, 12])

function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

export const internalRoutes = new Elysia({ prefix: '/internal' })
  .onBeforeHandle(({ headers, set, status }) => {
    const configured = settings.LICENSE_INTERNAL_SECRET
    if (!configured) {
      console.warn('Internal endpoint called but LICENSE_INTERNAL_SECRET is unset')
      return status(503, {
        detail: 'Internal endpoints are disabled (LICENSE_INTERNAL_SECRET not configured).',
      })
    }
    const provided = headers['x-internal-secret'] ?? ''
    if (provided !== configured) {
      console.warn('Invalid internal secret provided')
      return status(401, { detail: 'Invalid internal secret.' })
    }
  })
  .post(
    '/licenses/generate',
    ({ body, status }) => {
      const errors: string[] = []
      if (!body.product?.trim()) errors.push("'product' is required.")
      if (!body.slug?.trim()) errors.push("'slug' is required.")
      if (body.months === undefined || body.months === null) {
        errors.push("'months' is required.")
      } else if (!ALLOWED_MONTHS.has(body.months)) {
        errors.push("'months' must be one of [1, 3, 6, 12].")
      }
      if (errors.length > 0) {
        return status(400, { detail: errors.join(' ') })
      }

      const slug = body.slug!.trim()
      const product = body.product!.trim()
      const months = body.months!
      const db = getDb()

      // Check if active license already exists for this org slug
      const licenses = db
        .prepare('SELECT * FROM licenses WHERE product = ? AND slug = ? AND is_active = 1 ORDER BY created_at DESC')
        .all(product, slug) as unknown as LicenseRow[]

      const now = new Date()
      const existing = licenses.find(
        (l) => !l.expires_at || new Date(l.expires_at).getTime() > now.getTime(),
      )

      if (existing) {
        // Extend existing license
        const base = existing.expires_at ? new Date(existing.expires_at) : now
        const effectiveBase = base.getTime() > now.getTime() ? base : now
        const newExpiry = addMonths(effectiveBase, months)
        const newExpiryIso = newExpiry.toISOString()

        db.prepare('UPDATE licenses SET expires_at = ?, updated_at = ? WHERE id = ?').run(
          newExpiryIso,
          nowDb(),
          existing.id,
        )

        return {
          licenseKey: existing.license_key,
          expiresAt: newExpiryIso,
        }
      }

      // Provision new license
      const licenseKey = generateLicenseKey(product)
      const expiresAt = addMonths(now, months).toISOString()
      const id = randomUUID()
      const nowStr = nowDb()

      db.prepare(
        `INSERT INTO licenses
           (id, license_key, customer_name, customer_email, plan, product, slug, max_machines, is_active, expires_at, created_at, updated_at, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?, ?)`,
      ).run(
        id,
        licenseKey,
        slug,
        `${slug}@internal.ryasai`,
        'flat',
        product,
        slug,
        expiresAt,
        nowStr,
        nowStr,
        `Auto-provisioned via /internal/licenses/generate (slug=${slug})`,
      )

      return {
        licenseKey,
        expiresAt,
      }
    },
    {
      body: t.Object({
        product: t.Optional(t.String()),
        slug: t.Optional(t.String()),
        months: t.Optional(t.Number()),
      }),
    },
  )
