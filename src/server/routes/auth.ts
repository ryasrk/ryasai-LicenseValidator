/** Authentication routes for admin login and initial setup. */
import { randomUUID } from 'node:crypto'
import { Elysia, t } from 'elysia'

import { authenticate, createAccessToken, findAdminByEmail, hashPassword, isSetupRequired, verifyPassword } from '../auth'
import { settings } from '../config'
import { getDb } from '../db'
import { nowDb } from '../time'

export const authRoutes = new Elysia({ prefix: '/admin/auth' })
  /** Check if initial setup is needed (no admin exists yet). */
  .get('/setup-status', () => {
    const needsSetup = isSetupRequired()
    return {
      setup_required: needsSetup,
      message: needsSetup
        ? 'Initial setup required. Create your admin account.'
        : 'System configured. Please login.',
    }
  })

  /** First-time setup: create the admin account. Only works when no admin exists yet. */
  .post(
    '/setup',
    async ({ body, status }) => {
      if (!isSetupRequired()) {
        return status(403, { detail: 'Setup already completed. Use /login instead.' })
      }
      // Only the configured address may claim a fresh install
      const email = body.email.trim()
      if (email.toLowerCase() !== settings.ADMIN_EMAIL.trim().toLowerCase()) {
        return status(403, { detail: 'Setup is only allowed for the email configured as ADMIN_EMAIL.' })
      }
      if (body.password !== body.password_confirm) {
        return status(400, { detail: 'Passwords do not match.' })
      }

      const passwordHash = await hashPassword(body.password)
      // Re-check: hashing is async, another setup request may have finished meanwhile
      if (!isSetupRequired()) {
        return status(403, { detail: 'Setup already completed. Use /login instead.' })
      }
      getDb()
        .prepare('INSERT INTO admin_users (id, email, password_hash, is_active, created_at) VALUES (?, ?, ?, 1, ?)')
        .run(randomUUID(), email, passwordHash, nowDb())

      // Auto-login after setup
      const token = await createAccessToken({ email, token_version: 0 })
      return { access_token: token, token_type: 'bearer', email }
    },
    {
      body: t.Object({
        email: t.String({ maxLength: 200 }),
        password: t.String({ minLength: 8, maxLength: 200 }),
        password_confirm: t.String({ maxLength: 200 }),
      }),
    },
  )

  /** Admin login — returns JWT token. */
  .post(
    '/login',
    async ({ body, status }) => {
      // Check if setup is needed first
      if (isSetupRequired()) {
        return status(428, { detail: 'Initial setup required. Use /setup endpoint first.' })
      }

      const admin = findAdminByEmail(body.email)
      if (!admin || !admin.is_active || !(await verifyPassword(body.password, admin.password_hash))) {
        return status(401, { detail: 'Invalid email or password' })
      }

      const token = await createAccessToken(admin)
      return { access_token: token, token_type: 'bearer', email: admin.email }
    },
    { body: t.Object({ email: t.String({ maxLength: 200 }), password: t.String({ maxLength: 200 }) }) },
  )

  /** Verify if a token is still valid. */
  .post(
    '/verify',
    async ({ query }) => {
      const admin = await authenticate(query.token)
      return { valid: admin !== null, email: admin?.email ?? null }
    },
    { query: t.Object({ token: t.String() }) },
  )
