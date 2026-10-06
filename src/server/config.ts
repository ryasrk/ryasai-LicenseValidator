/** License Manager configuration (environment variables / .env). */

const env = process.env

/** Accepts the legacy SQLAlchemy URL (sqlite+aiosqlite:///./data/license.db) or a plain file path. */
function resolveDatabasePath(url: string): string {
  const match = url.match(/^sqlite(?:\+\w+)?:\/\/\/(.+)$/)
  return match ? match[1] : url
}

export const settings = {
  APP_NAME: env.APP_NAME ?? 'License Manager',
  APP_VERSION: env.APP_VERSION ?? '2.0.0',
  SECRET_KEY: env.SECRET_KEY ?? 'change-me-in-production-super-secret',

  // Database (SQLite — lightweight, no external service needed)
  DATABASE_PATH: resolveDatabasePath(env.DATABASE_URL ?? './data/license.db'),

  // JWT (HS256)
  JWT_SECRET: env.JWT_SECRET ?? 'jwt-secret-key-change-me',
  JWT_EXPIRE_HOURS: Number(env.JWT_EXPIRE_HOURS ?? 24),

  // Admin (email only — password set via first-login setup)
  ADMIN_EMAIL: env.ADMIN_EMAIL ?? 'admin@ryasai.com',

  // CORS
  CORS_ORIGINS: env.CORS_ORIGINS ?? '', // Comma-separated additional origins

  // Ed25519 signing key (DER-encoded, hex). Used to sign validation responses.
  // Generate: node -e "const c=require('crypto');const{publicKey:k1,privateKey:k2}=c.generateKeyPairSync('ed25519');console.log(k1.export({type:'spki',format:'der'}).toString('hex'));console.log(k2.export({type:'pkcs8',format:'der'}).toString('hex'))"
  LICENSE_SIGNING_PRIVATE_KEY: env.LICENSE_SIGNING_PRIVATE_KEY ?? '',
}
