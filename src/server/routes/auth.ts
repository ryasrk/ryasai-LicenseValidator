/** Authentication routes for admin login and initial setup. */
import { randomUUID } from 'node:crypto'
import { Elysia, t } from 'elysia'

import { createAccessToken, decodeToken, hashPassword, isSetupRequired, verifyPassword } from '../auth'
import { getDb, type AdminUserRow } from '../db'
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
        .run(randomUUID(), body.email, passwordHash, nowDb())

      // Auto-login after setup
      const token = await createAccessToken({ sub: body.email })
      return { access_token: token, token_type: 'bearer', email: body.email }
    },
    {
      body: t.Object({
        email: t.String(),
        password: t.String({ minLength: 8 }),
        password_confirm: t.String(),
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

      const admin = getDb()
        .prepare('SELECT * FROM admin_users WHERE email = ? AND is_active = 1')
        .get(body.email) as AdminUserRow | undefined

      if (!admin || !(await verifyPassword(body.password, admin.password_hash))) {
        return status(401, { detail: 'Invalid email or password' })
      }

      const token = await createAccessToken({ sub: admin.email })
      return { access_token: token, token_type: 'bearer', email: admin.email }
    },
    { body: t.Object({ email: t.String(), password: t.String() }) },
  )

  /** Verify if a token is still valid. */
  .post(
    '/verify',
    async ({ query }) => {
      const payload = await decodeToken(query.token)
      return { valid: payload !== null, email: payload?.sub ?? null }
    },
    { query: t.Object({ token: t.String() }) },
  )
