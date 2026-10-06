/** License Manager Server — multi-app license validation & management. */
import { cors } from '@elysiajs/cors'
import { Elysia } from 'elysia'

import { settings } from './config'
import { rateLimit } from './middleware'
import { adminRoutes } from './routes/admin'
import { authRoutes } from './routes/auth'
import { licenseRoutes } from './routes/license'

const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:8000',
  'http://localhost:9000',
  ...settings.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean),
]

export const app = new Elysia()
  // ─── Middleware ────────────────────────────────────────────────────────────
  .use(
    cors({
      origin: ALLOWED_ORIGINS,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    }),
  )
  .onRequest(({ request }) => rateLimit(request))
  // Errors use the same {"detail": ...} shape the FastAPI server returned
  .onError(({ code, error, status }) => {
    if (code === 'VALIDATION') {
      const detail = error.all.map((e) => ('summary' in e && e.summary) || 'Invalid request').join('; ')
      return status(422, { detail: detail || 'Invalid request' })
    }
    if (code === 'PARSE') return status(422, { detail: 'Invalid request body' })
    if (code === 'NOT_FOUND') return status(404, { detail: 'Not Found' })
    console.error(error)
    return status(500, { detail: 'Internal Server Error' })
  })

  // ─── Routes ────────────────────────────────────────────────────────────────
  .get('/health', () => ({ status: 'healthy', service: 'license-manager', version: settings.APP_VERSION }))
  .group('/api/v1', (api) =>
    api
      // Public: license validation (called by client apps)
      .use(licenseRoutes)
      // Public: auth (login + setup)
      .use(authRoutes)
      // Protected: admin management (requires JWT)
      .use(adminRoutes),
  )

export type App = typeof app
