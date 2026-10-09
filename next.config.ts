import type { NextConfig } from 'next'

const isDev = process.env.NODE_ENV === 'development'

// Everything the dashboard loads is served by this app, so only same-origin sources are allowed.
// Inline scripts stay allowed: Next.js and the theme script in app/layout.tsx emit them, and a
// nonce-based policy would force every page to render on demand.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  `connect-src 'self'${isDev ? ' ws: wss:' : ''}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  // Only honoured over HTTPS, so it is harmless on a plain-HTTP dev server
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
  // The legacy XSS auditor is switched off on purpose: it is removed from current browsers and
  // caused vulnerabilities of its own in old ones. The CSP above is the protection.
  { key: 'X-XSS-Protection', value: '0' },
]

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig
