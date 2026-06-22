/**
 * Bogota timezone utilities.
 * Bogota = America/Bogota = UTC-5 (no DST since 1993).
 * All functions return Date objects with the correct UTC timestamp
 * representing the corresponding Bogota local time.
 */

/** Midnight today in Bogota (UTC-5), expressed as UTC. Returns a Date at 05:00 UTC. */
export function todayBogota(): Date {
  const now = new Date()
  const dateStr = now.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day, 5, 0, 0, 0))
}

/** Current date/time in Bogota, expressed as a UTC Date. */
export function nowBogota(): Date {
  const now = new Date()
  const dateStr = now.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
  const timeStr = now.toLocaleTimeString('en-GB', { timeZone: 'America/Bogota', hour12: false })
  const [year, month, day] = dateStr.split('-').map(Number)
  const [hours, minutes, seconds] = timeStr.split(':').map(Number)
  // Bogota UTC-5 → add 5 to convert to UTC
  return new Date(Date.UTC(year, month - 1, day, hours + 5, minutes, seconds || 0))
}

/** Start of month in Bogota (midnight first day), expressed as UTC. */
export function monthStartBogota(date?: Date): Date {
  const d = date || nowBogota()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 5, 0, 0, 0))
}

/** Start of next month in Bogota, expressed as UTC. */
export function monthEndBogota(date?: Date): Date {
  const d = date || nowBogota()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 5, 0, 0, 0))
}