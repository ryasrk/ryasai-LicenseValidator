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
import { getDb } from './db'

const jwtSecret = () => new TextEncoder().encode(settings.JWT_SECRET)

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export function verifyPassword(plain: string, hashed: string): Promise<boolean> {
  return bcrypt.compare(plain, hashed)
}

export function createAccessToken(data: { sub: string }): Promise<string> {
  return new SignJWT(data)
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

/** Check if system needs initial setup (no admin exists). */
export function isSetupRequired(): boolean {
  return !getDb().prepare('SELECT id FROM admin_users LIMIT 1').get()
}
