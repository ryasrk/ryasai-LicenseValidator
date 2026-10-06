/** License Manager configuration (environment variables / .env). */

const env = process.env

/** Accepts the legacy SQLAlchemy URL (sqlite+aiosqlite:///./data/license.db) or a plain file path. */
function resolveDatabasePath(url: string): string {
  const match = url.match(/^sqlite(?:\+\w+)?:\/\/\/(.+)$/)
  return match ? match[1] : url
}

export const settings = {
  get APP_NAME() { return process.env.APP_NAME ?? 'License Manager' },
  get APP_VERSION() { return process.env.APP_VERSION ?? '2.0.0' },
  get SECRET_KEY() { return process.env.SECRET_KEY ?? 'change-me-in-production-super-secret' },

  // Database (SQLite — lightweight, no external service needed)
  get DATABASE_PATH() { return resolveDatabasePath(process.env.DATABASE_URL ?? './data/license.db') },

  // JWT (HS256)
  get JWT_SECRET() { return process.env.JWT_SECRET ?? 'jwt-secret-key-change-me' },
  get JWT_EXPIRE_HOURS() { return Number(process.env.JWT_EXPIRE_HOURS ?? 24) },

  // Admin (email only — password set via first-login setup)
  get ADMIN_EMAIL() { return process.env.ADMIN_EMAIL ?? 'admin@ryasai.com' },

  // CORS
  get CORS_ORIGINS() { return process.env.CORS_ORIGINS ?? '' },

  // Shared secret for internal server-to-server endpoints (/internal/*).
  get LICENSE_INTERNAL_SECRET() { return process.env.LICENSE_INTERNAL_SECRET ?? '' },

  // Ed25519 signing key (DER-encoded, hex). Used to sign validation responses.
  // Generate: node -e "const c=require('crypto');const{publicKey:k1,privateKey:k2}=c.generateKeyPairSync('ed25519');console.log(k1.export({type:'spki',format:'der'}).toString('hex'));console.log(k2.export({type:'pkcs8',format:'der'}).toString('hex'))"
  get LICENSE_SIGNING_PRIVATE_KEY() { return process.env.LICENSE_SIGNING_PRIVATE_KEY ?? '' },
}
