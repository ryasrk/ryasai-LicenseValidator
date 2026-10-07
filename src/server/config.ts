/** License Manager configuration (environment variables / .env). */

/** Accepts the legacy SQLAlchemy URL (sqlite+aiosqlite:///./data/license.db) or a plain file path. */
function resolveDatabasePath(url: string): string {
  const match = url.match(/^sqlite(?:\+\w+)?:\/\/\/(.+)$/)
  return match ? match[1] : url
}

/** A whole number >= 0 from the environment, or the fallback when unset or invalid. */
function count<T extends number | null>(value: string | undefined, fallback: T): number | T {
  const n = Number(value)
  return value !== undefined && value.trim() !== '' && Number.isInteger(n) && n >= 0 ? n : fallback
}

/** Placeholder secret: request signing is refused while SECRET_KEY still has this value. */
export const DEFAULT_SECRET_KEY = 'change-me-in-production-super-secret'

export const settings = {
  get APP_NAME() { return process.env.APP_NAME ?? 'License Manager' },
  get APP_VERSION() { return process.env.APP_VERSION ?? '2.0.0' },
  // Shared with the apps that send signed requests (license renewal)
  get SECRET_KEY() { return process.env.SECRET_KEY ?? DEFAULT_SECRET_KEY },

  // Database (SQLite — lightweight, no external service needed)
  get DATABASE_PATH() { return resolveDatabasePath(process.env.DATABASE_URL ?? './data/license.db') },

  // JWT (HS256)
  get JWT_SECRET() { return process.env.JWT_SECRET ?? 'jwt-secret-key-change-me' },
  get JWT_EXPIRE_HOURS() { return Number(process.env.JWT_EXPIRE_HOURS ?? 24) },

  // The only email the first-time setup accepts (the password is chosen during setup)
  get ADMIN_EMAIL() { return process.env.ADMIN_EMAIL ?? 'admin@ryasai.com' },

  // CORS
  get CORS_ORIGINS() { return process.env.CORS_ORIGINS ?? '' },

  // Shared secret for internal server-to-server endpoints (/internal/*).
  get LICENSE_INTERNAL_SECRET() { return process.env.LICENSE_INTERNAL_SECRET ?? '' },

  // Reverse proxies in front of this server that append to X-Forwarded-For.
  // Unset (null) = detect: the header is believed only when the connection comes from a local proxy.
  // 0 = clients connect directly, so the header is always ignored and the socket address is used.
  get TRUSTED_PROXY_HOPS() { return count(process.env.TRUSTED_PROXY_HOPS, null) },

  // An active machine not seen for this many days gives its slot back. 0 = never.
  get MACHINE_STALE_DAYS() { return count(process.env.MACHINE_STALE_DAYS, 30) },

  // Validation logs older than this many days are deleted. 0 = keep forever.
  get LOG_RETENTION_DAYS() { return count(process.env.LOG_RETENTION_DAYS, 0) },

  // Ed25519 signing key (DER-encoded, hex). Used to sign validation responses.
  // Generate: node -e "const c=require('crypto');const{publicKey:k1,privateKey:k2}=c.generateKeyPairSync('ed25519');console.log(k1.export({type:'spki',format:'der'}).toString('hex'));console.log(k2.export({type:'pkcs8',format:'der'}).toString('hex'))"
  get LICENSE_SIGNING_PRIVATE_KEY() { return process.env.LICENSE_SIGNING_PRIVATE_KEY ?? '' },
}
