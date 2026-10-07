/**
 * Dates as the API sends them: UTC without a zone ("2026-10-06T08:15:30.123000").
 * new Date() would read that as local time, so everything shown in the dashboard goes through here.
 */

export function parseServerDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const date = new Date(/(Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : value + 'Z')
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDate(value: string | null | undefined, fallback = '-'): string {
  return parseServerDate(value)?.toLocaleDateString() ?? fallback
}

export function formatDateTime(value: string | null | undefined, fallback = '-'): string {
  return parseServerDate(value)?.toLocaleString() ?? fallback
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Server date -> value for <input type="date">, in the viewer's time zone. */
export function toDateInput(value: string | null | undefined): string {
  const date = parseServerDate(value)
  return date ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` : ''
}

/** <input type="date"> value -> the first or last instant of that day in the viewer's time zone, as ISO. */
export function dayBoundary(dateInput: string, edge: 'start' | 'end'): string {
  const [year, month, day] = dateInput.split('-').map(Number)
  const date = edge === 'start' ? new Date(year, month - 1, day, 0, 0, 0, 0) : new Date(year, month - 1, day, 23, 59, 59, 999)
  return date.toISOString()
}
