/**
 * Self-contained timezone helpers for API routes.
 * Reads the country from Settings DB and computes dates in that timezone.
 * Each function has try/catch with fallback so routes never crash
 * due to timezone issues.
 */

import { db } from '@/lib/db'
import { getCountryTz, type CountryTz } from './country-timezone'

/** Get CountryTz from DB settings, with safe fallback */
export async function fetchAppTz(): Promise<CountryTz> {
  try {
    const settings = await db.settings.findFirst({ select: { country: true } })
    const country = settings?.country || 'VE'
    return getCountryTz(country)
  } catch {
    return { timezone: 'America/Bogota', locale: 'es-CO' }
  }
}

/** Midnight today in the app timezone, expressed as UTC */
export async function fetchToday(tz?: string): Promise<Date> {
  try {
    if (!tz) {
      const appTz = await fetchAppTz()
      tz = appTz.timezone
    }
    const now = new Date()
    const dateStr = now.toLocaleDateString('en-CA', { timeZone: tz })
    const [year, month, day] = dateStr.split('-').map(Number)
    const localMidnight = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0))
    const utcDate = new Date(`${dateStr}T00:00:00`)
    const localDate = new Date(utcDate.toLocaleString('en-US', { timeZone: tz }))
    const offsetMs = localDate.getTime() - utcDate.getTime()
    return new Date(localMidnight.getTime() - offsetMs)
  } catch {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), now.getDate())
  }
}

/** Current datetime in app timezone as UTC */
export async function fetchNow(tz?: string): Promise<Date> {
  try {
    if (!tz) {
      const appTz = await fetchAppTz()
      tz = appTz.timezone
    }
    const now = new Date()
    const dateStr = now.toLocaleDateString('en-CA', { timeZone: tz })
    const timeStr = now.toLocaleTimeString('en-GB', { timeZone: tz, hour12: false })
    const [year, month, day] = dateStr.split('-').map(Number)
    const [hours, minutes, seconds] = timeStr.split(':').map(Number)
    const utcDate = new Date(`${dateStr}T${timeStr}`)
    const localDate = new Date(utcDate.toLocaleString('en-US', { timeZone: tz }))
    const offsetMs = localDate.getTime() - utcDate.getTime()
    const offsetHours = offsetMs / (1000 * 60 * 60)
    return new Date(Date.UTC(year, month - 1, day, hours - offsetHours, minutes, seconds || 0))
  } catch {
    return new Date()
  }
}

/** Start of current month in app timezone as UTC */
export function getMonthStart(d: Date, tz: string): Date {
  try {
    const dateStr = d.toLocaleDateString('en-CA', { timeZone: tz })
    const [year, month] = dateStr.split('-').map(Number)
    const firstOfMonth = new Date(Date.UTC(year, Number(month) - 1, 1, 0, 0, 0, 0))
    const utcStr = firstOfMonth.toISOString().slice(0, 10)
    const localDate = new Date(`${utcStr}T00:00:00`)
    const refDate = new Date(localDate.toLocaleString('en-US', { timeZone: tz }))
    const offsetMs = refDate.getTime() - localDate.getTime()
    return new Date(firstOfMonth.getTime() - offsetMs)
  } catch {
    return new Date(d.getFullYear(), d.getMonth(), 1)
  }
}

/** UTC offset in hours for a timezone at the current moment */
export function getOffsetHours(tz: string): number {
  try {
    const now = new Date()
    const utcStr = now.toISOString().slice(0, 13).replace('T', ' ')
    const localStr = now.toLocaleString('en-US', { timeZone: tz })
    const utcDate = new Date(utcStr + ':00:00 UTC')
    const localDate = new Date(localStr)
    return (localDate.getTime() - utcDate.getTime()) / (1000 * 60 * 60)
  } catch {
    return 0
  }
}

/** Start of next month in app timezone as UTC */
export function getMonthEnd(d: Date, tz: string): Date {
  try {
    const dateStr = d.toLocaleDateString('en-CA', { timeZone: tz })
    const [year, month] = dateStr.split('-').map(Number)
    const nextMonth = new Date(Date.UTC(year, Number(month), 1, 0, 0, 0, 0))
    const utcStr = nextMonth.toISOString().slice(0, 10)
    const localDate = new Date(`${utcStr}T00:00:00`)
    const refDate = new Date(localDate.toLocaleString('en-US', { timeZone: tz }))
    const offsetMs = refDate.getTime() - localDate.getTime()
    return new Date(nextMonth.getTime() - offsetMs)
  } catch {
    return new Date(d.getFullYear(), d.getMonth() + 1, 1)
  }
}