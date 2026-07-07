/**
 * Dynamic timezone utilities.
 * Reads the configured country from the Settings DB table and derives
 * the correct IANA timezone, so all date calculations use the user's
 * selected country instead of a hardcoded value.
 *
 * All functions return Date objects with UTC timestamps representing
 * the corresponding local time in the configured timezone.
 */

import { db } from '@/lib/db'
import { getTimezone, getLocale, type CountryTz } from './country-timezone'

// ─── Cache ────────────────────────────────────────────────────────────────────

let _cachedCountry = ''
let _cachedTz: CountryTz | null = null

/** Get the cached or freshly-loaded CountryTz */
export async function getAppTz(): Promise<CountryTz> {
  if (_cachedTz) return _cachedTz
  await refreshAppTz()
  return _cachedTz!
}

/** Force re-read the country from DB and update cache */
export async function refreshAppTz(): Promise<CountryTz> {
  const settings = await db.settings.findFirst({ select: { country: true } })
  const country = settings?.country || 'VE'
  if (country !== _cachedCountry) {
    _cachedCountry = country
    _cachedTz = getCountryTz(country)
  }
  return _cachedTz!
}

/** Get just the IANA timezone string (async, reads from DB) */
export async function getAppTimezone(): Promise<string> {
  const tz = await getAppTz()
  return tz.timezone
}

/** Get just the locale string (async, reads from DB) */
export async function getAppLocale(): Promise<string> {
  const tz = await getAppTz()
  return tz.locale
}

// ─── Core date helpers (async – read from DB) ────────────────────────────────

/** Midnight today in the app's timezone, expressed as UTC. */
export async function todayApp(): Promise<Date> {
  const { timezone } = await getAppTz()
  const now = new Date()
  const dateStr = now.toLocaleDateString('en-CA', { timeZone: timezone })
  const [year, month, day] = dateStr.split('-').map(Number)

  // Calculate UTC offset for this timezone at this moment
  const utcDate = new Date(`${dateStr}T00:00:00`)
  const localDate = new Date(utcDate.toLocaleString('en-US', { timeZone: timezone }))
  const offsetMs = localDate.getTime() - utcDate.getTime()

  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0) - offsetMs)
}

/** Current date/time in the app's timezone, expressed as UTC. */
export async function nowApp(): Promise<Date> {
  const { timezone } = await getAppTz()
  const now = new Date()
  const dateStr = now.toLocaleDateString('en-CA', { timeZone: timezone })
  const timeStr = now.toLocaleTimeString('en-GB', { timeZone: timezone, hour12: false })
  const [year, month, day] = dateStr.split('-').map(Number)
  const [hours, minutes, seconds] = timeStr.split(':').map(Number)

  // Calculate UTC offset
  const utcDate = new Date(`${dateStr}T${timeStr}`)
  const localDate = new Date(utcDate.toLocaleString('en-US', { timeZone: timezone }))
  const offsetMs = localDate.getTime() - utcDate.getTime()
  const offsetHours = offsetMs / (1000 * 60 * 60)

  return new Date(Date.UTC(year, month - 1, day, hours - offsetHours, minutes, seconds || 0))
}

/** Start of current month in the app's timezone (midnight first day), expressed as UTC. */
export async function monthStartApp(date?: Date): Promise<Date> {
  const d = date || await nowApp()
  const { timezone } = await getAppTz()
  const dateStr = d.toLocaleDateString('en-CA', { timeZone: timezone })
  const [year, month] = dateStr.split('-').map(Number)

  const firstOfMonth = new Date(Date.UTC(year, Number(month) - 1, 1, 0, 0, 0, 0))
  const utcStr = firstOfMonth.toISOString().slice(0, 10)
  const localDate = new Date(`${utcStr}T00:00:00`)
  const refDate = new Date(localDate.toLocaleString('en-US', { timeZone: timezone }))
  const offsetMs = refDate.getTime() - localDate.getTime()

  return new Date(firstOfMonth.getTime() - offsetMs)
}

/** Start of next month in the app's timezone, expressed as UTC. */
export async function monthEndApp(date?: Date): Promise<Date> {
  const d = date || await nowApp()
  const { timezone } = await getAppTz()
  const dateStr = d.toLocaleDateString('en-CA', { timeZone: timezone })
  const [year, month] = dateStr.split('-').map(Number)

  const nextMonth = new Date(Date.UTC(year, Number(month), 1, 0, 0, 0, 0))
  const utcStr = nextMonth.toISOString().slice(0, 10)
  const localDate = new Date(`${utcStr}T00:00:00`)
  const refDate = new Date(localDate.toLocaleString('en-US', { timeZone: timezone }))
  const offsetMs = refDate.getTime() - localDate.getTime()

  return new Date(nextMonth.getTime() - offsetMs)
}

// ─── Synchronous helpers (use cached timezone) ────────────────────────────────
// These are useful for client-side code where we already loaded settings.

/** Get cached timezone (sync – must call getAppTz() first or rely on DB cache) */
export function getCachedTz(): CountryTz {
  return _cachedTz || { timezone: 'America/Caracas', locale: 'es-VE' }
}

/** Midnight today using cached timezone (sync) */
export function todayAppSync(): Date {
  const { timezone } = getCachedTz()
  const now = new Date()
  const dateStr = now.toLocaleDateString('en-CA', { timeZone: timezone })
  const [year, month, day] = dateStr.split('-').map(Number)

  const utcDate = new Date(`${dateStr}T00:00:00`)
  const localDate = new Date(utcDate.toLocaleString('en-US', { timeZone: timezone }))
  const offsetMs = localDate.getTime() - utcDate.getTime()

  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0) - offsetMs)
}

/** UTC offset in hours for the cached timezone at the current moment */
export function getCachedOffsetHours(): number {
  const { timezone } = getCachedTz()
  const now = new Date()
  const utcStr = now.toISOString().slice(0, 13).replace('T', ' ')
  const localStr = now.toLocaleString('en-US', { timeZone: timezone })
  const utcDate = new Date(utcStr + ':00:00 UTC')
  const localDate = new Date(localStr)
  return (localDate.getTime() - utcDate.getTime()) / (1000 * 60 * 60)
}

// ─── Backward-compatible aliases ──────────────────────────────────────────────
// These allow gradual migration: existing imports of bogota-time still work
// but now use the dynamic timezone from Settings.

export const todayBogota = async () => todayApp()
export const nowBogota = async () => nowApp()
export const monthStartBogota = async (date?: Date) => monthStartApp(date)
export const monthEndBogota = async (date?: Date) => monthEndApp(date)