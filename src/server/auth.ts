/**
 * JWT Authentication for License Manager Admin API.
 *
 * - Admin endpoints require valid JWT token
 * - Tokens expire after configurable hours
 * - Password hashed with bcrypt
 * - First login requires password setup (no hardcoded default)
 */
import bcrypt from 'bcryptjs'
import { SignJWT, jwtVerify, type JWTPayload } from 'jose'

import { settings } from './config'
import { getDb, type AdminUserRow } from './db'

const jwtSecret = () => new TextEncoder().encode(settings.JWT_SECRET)

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export function verifyPassword(plain: string, hashed: string): Promise<boolean> {
  return bcrypt.compare(plain, hashed)
}

/** Token for an admin. It stops working when the admin is deactivated or their token_version changes. */
export function createAccessToken(admin: Pick<AdminUserRow, 'email' | 'token_version'>): Promise<string> {
  return new SignJWT({ sub: admin.email, ver: admin.token_version })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime(`${settings.JWT_EXPIRE_HOURS}h`)
    .sign(jwtSecret())
}

/** Returns the token payload, or null if the token is invalid or expired. */
export async function decodeToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, jwtSecret(), { algorithms: ['HS256'] })
    return payload
  } catch {
    return null
  }
}

export function findAdminByEmail(email: string): AdminUserRow | undefined {
  return getDb().prepare('SELECT * FROM admin_users WHERE lower(email) = lower(?)').get(email.trim()) as
    | AdminUserRow
    | undefined
}

/** The active admin a token belongs to, or null if the token or the account is no longer good. */
export async function authenticate(token: string): Promise<AdminUserRow | null> {
  const payload = await decodeToken(token)
  if (!payload?.sub) return null
  const admin = findAdminByEmail(payload.sub)
  if (!admin || !admin.is_active) return null
  // Tokens issued before token_version existed carry no version and count as 0
  if ((typeof payload.ver === 'number' ? payload.ver : 0) !== admin.token_version) return null
  return admin
}

/** Check if system needs initial setup (no admin exists). */
export function isSetupRequired(): boolean {
  return !getDb().prepare('SELECT id FROM admin_users LIMIT 1').get()
}
