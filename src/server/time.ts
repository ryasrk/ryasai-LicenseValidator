/**
 * Datetime helpers.
 *
 * Datetimes are naive UTC, stored the way SQLAlchemy wrote them to SQLite
 * ("YYYY-MM-DD HH:MM:SS.ffffff") so databases created by the Python server keep working,
 * and returned the way Python's isoformat() printed them.
 */

export function toDb(date: Date): string {
  return date.toISOString().replace('T', ' ').replace('Z', '000')
}

export function nowDb(): string {
  return toDb(new Date())
}

/** The stored datetime `days` days before now. */
export function daysAgoDb(days: number): string {
  return toDb(new Date(Date.now() - days * 86_400_000))
}

export function dbToMs(value: string): number {
  return Date.parse(value.replace(' ', 'T') + 'Z')
}

/** Stored datetime -> isoformat() string (fraction omitted when zero). */
export function toIso(value: string | null): string | null {
  if (!value) return null
  return value.replace(' ', 'T').replace(/\.0+$/, '')
}

/**
 * ISO date or datetime from a request -> stored format. Returns null if unparseable.
 * A date without a time means the start of that day (UTC), or its last millisecond
 * with dateOnly = 'end' — used for expiry dates, which stay valid through the day.
 */
export function parseIso(input: string, dateOnly: 'start' | 'end' = 'start'): string | null {
  const value = input.trim()
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(value) && value.length > 10
  const ms = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? Date.parse(value + (dateOnly === 'end' ? 'T23:59:59.999Z' : 'T00:00:00Z'))
    : Date.parse(hasZone ? value : value.replace(' ', 'T') + 'Z')
  return Number.isNaN(ms) ? null : toDb(new Date(ms))
}
