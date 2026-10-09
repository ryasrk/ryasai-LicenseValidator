/** License Manager Server — multi-app license validation & management. */
import { cors } from '@elysiajs/cors'
import { Elysia } from 'elysia'

import { settings } from './config'
import { rateLimit } from './middleware'
import { adminRoutes } from './routes/admin'
import { authRoutes } from './routes/auth'
import { internalRoutes } from './routes/internal'
import { licenseRoutes } from './routes/license'

const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:8000',
  'http://localhost:9000',
  ...settings.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean),
]

/**
 * A request with a body must declare it as JSON. An HTML form on another site can only send
 * urlencoded, multipart or text/plain bodies, so this keeps cross-site form posts out.
 */
function requireJsonBody(request: Request): Response | undefined {
  const hasBody = Number(request.headers.get('content-length')) > 0 || request.headers.has('transfer-encoding')
  if (!hasBody || /^application\/json\s*(;|$)/i.test(request.headers.get('content-type') ?? '')) return
  return Response.json({ detail: 'Content-Type must be application/json' }, { status: 415 })
}

export const app = new Elysia()
  // ─── Middleware ────────────────────────────────────────────────────────────
  .use(
    cors({
      origin: ALLOWED_ORIGINS,
      // Authentication is a Bearer token sent by script, never a cookie, so browsers
      // have no credentials to attach
      credentials: false,
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
      // Named explicitly: the default echoes the request's own header names back
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Signature', 'X-Timestamp'],
      exposeHeaders: ['Retry-After'],
      maxAge: 600,
    }),
  )
  .onRequest(({ request }) => rateLimit(request) ?? requireJsonBody(request))
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
  // Internal: server-to-server (shared-secret auth — deliberately NOT admin JWT)
  .use(internalRoutes)
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
