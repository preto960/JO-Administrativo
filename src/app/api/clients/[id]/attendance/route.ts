import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { getPermissions } from '@/lib/permissions'
import { fetchAppTz, fetchToday, fetchNow, getMonthStart, getMonthEnd } from '@/lib/tz-helpers'

function getPlanDays(durationType: string, durationDays: number | null): number {
  switch (durationType) {
    case 'dia': return 1
    case '1_mes': return 30
    case 'bimestral': return 60
    case 'anual': return 365
    case 'otro': return durationDays || 0
    default: return 30
  }
}

function calcDaysRemaining(endDate: Date, today: Date): number {
  const end = new Date(endDate)
  const diff = end.getTime() - today.getTime()
  const days = diff / (1000 * 60 * 60 * 24)
  return Math.max(0, Math.round(days))
}

/** Check if current time (in app timezone) is within the schedule range */
function isWithinSchedule(startTime: string | null, endTime: string | null, appTz: string): boolean {
  if (!startTime || !endTime) return true // no restriction if no schedule
  try {
    const now = new Date()
    const currentTime = now.toLocaleTimeString('en-GB', { timeZone: appTz, hour12: false })
    return currentTime >= startTime && currentTime <= endTime
  } catch {
    return true
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if ('status' in auth) return auth
  const perms = getPermissions(auth.role)
  if (!perms.canManageClients && !perms.canMarkAttendance) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const { id } = await params

  try {
    const client = await db.client.findUnique({
      where: { id },
      include: {
        memberships: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { plan: true },
        },
      },
    })
    if (!client) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
    }

    const membership = client.memberships[0] || null
    const appTz = await fetchAppTz()

    const attendances = await db.attendance.findMany({
      where: { clientId: id },
      orderBy: { date: 'desc' },
    })

    const appNow = await fetchNow(appTz.timezone)
    const monthStart = getMonthStart(appNow, appTz.timezone)
    const monthEnd = getMonthEnd(appNow, appTz.timezone)
    const monthAttendances = attendances.filter(
      (a) => a.date >= monthStart && a.date < monthEnd
    )

    const planType = membership?.planType || membership?.plan?.planType || 'dias'
    const totalPlanDays = (planType === 'dias' && membership?.plan)
      ? getPlanDays(membership.plan.durationType, membership.plan.durationDays)
      : (planType === 'horario')
        ? membership?.daysRemaining || 0
        : (membership?.daysRemaining || 0)

    const planName = membership?.plan?.name || membership?.tarifa || null

    let daysRemaining = membership?.daysRemaining || 0
    if (membership?.endDate) {
      const today = await fetchToday(appTz.timezone)
      daysRemaining = calcDaysRemaining(membership.endDate, today)
    }

    const totalAttendances = attendances.length
    const monthAttendanceCount = monthAttendances.length

    return NextResponse.json({
      attendances,
      stats: {
        planType,
        totalPlanDays,
        planName,
        daysRemaining,
        ticketsRemaining: membership?.ticketsRemaining || 0,
        ticketTotal: (planType === 'tickets' && membership?.plan) ? membership.plan.ticketCount : 0,
        startTime: membership?.startTime || membership?.plan?.startTime || null,
        endTime: membership?.endTime || membership?.plan?.endTime || null,
        totalAttendances,
        monthAttendanceCount,
        monthName: appNow.toLocaleDateString(appTz.locale, { timeZone: appTz.timezone, month: 'long', year: 'numeric' }),
      },
    })
  } catch (error) {
    console.error('[Attendance GET]', error)
    return NextResponse.json({ error: 'Error al obtener asistencia' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if ('status' in auth) return auth
  const perms = getPermissions(auth.role)
  if (!perms.canManageClients && !perms.canMarkAttendance) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const { id } = await params

  try {
    const client = await db.client.findUnique({
      where: { id },
      include: {
        memberships: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { plan: true },
        },
      },
    })
    if (!client) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
    }

    const membership = client.memberships[0]

    // ── Validate membership status ──
    if (!membership || membership.status !== 'Activo') {
      return NextResponse.json({ error: 'El cliente no tiene una membresía activa' }, { status: 400 })
    }

    const planType = membership.planType || membership.plan?.planType || 'dias'
    const appTz = await fetchAppTz()

    // ── POR DÍAS: standard behavior (existing) ──
    if (planType === 'dias') {
      const today = await fetchToday()

      // Check if already marked today
      const existing = await db.attendance.findUnique({
        where: { clientId_date: { clientId: id, date: today } },
      })
      if (existing) {
        return NextResponse.json({ error: 'Ya se marcó la asistencia de hoy para este cliente' }, { status: 409 })
      }

      await db.$transaction([
        db.attendance.create({ data: { clientId: id, date: today } }),
        db.client.update({ where: { id }, data: { lastAttendance: new Date() } }),
      ])

      return NextResponse.json({ message: 'Asistencia marcada (plan por días)' }, { status: 201 })
    }

    // ── POR HORARIO: only allow within schedule ──
    if (planType === 'horario') {
      const startTime = membership.startTime || membership.plan?.startTime
      const endTime = membership.endTime || membership.plan?.endTime

      if (!startTime || !endTime) {
        return NextResponse.json({ error: 'El plan horario no tiene horas configuradas' }, { status: 400 })
      }

      if (!isWithinSchedule(startTime, endTime, appTz.timezone)) {
        const now = new Date()
        const currentTime = now.toLocaleTimeString('en-GB', { timeZone: appTz.timezone, hour12: false })
        return NextResponse.json({
          error: `Fuera del horario permitido. Hora actual: ${currentTime}. Horario del plan: ${startTime} - ${endTime}`,
        }, { status: 400 })
      }

      const today = await fetchToday()

      // Check if already marked today
      const existing = await db.attendance.findUnique({
        where: { clientId_date: { clientId: id, date: today } },
      })
      if (existing) {
        return NextResponse.json({ error: 'Ya se marcó la asistencia de hoy para este cliente' }, { status: 409 })
      }

      await db.$transaction([
        db.attendance.create({ data: { clientId: id, date: today } }),
        db.client.update({ where: { id }, data: { lastAttendance: new Date() } }),
      ])

      return NextResponse.json({ message: 'Asistencia marcada (plan por horario)' }, { status: 201 })
    }

    // ── POR TICKETS: decrement ticket count ──
    if (planType === 'tickets') {
      if (membership.ticketsRemaining <= 0) {
        return NextResponse.json({ error: 'El cliente no tiene tickets disponibles' }, { status: 400 })
      }

      const today = await fetchToday()

      // Check if already marked today (prevent double attendance per day even with tickets)
      const existing = await db.attendance.findUnique({
        where: { clientId_date: { clientId: id, date: today } },
      })
      if (existing) {
        return NextResponse.json({ error: 'Ya se marcó la asistencia de hoy para este cliente' }, { status: 409 })
      }

      await db.$transaction([
        db.attendance.create({ data: { clientId: id, date: today } }),
        db.client.update({ where: { id }, data: { lastAttendance: new Date() } }),
        db.clientMembership.update({
          where: { id: membership.id },
          data: {
            ticketsRemaining: { decrement: 1 },
          },
        }),
      ])

      const remaining = membership.ticketsRemaining - 1

      // If no tickets left, expire the membership
      if (remaining <= 0) {
        await db.clientMembership.update({
          where: { id: membership.id },
          data: {
            status: 'Vencido',
            ticketsRemaining: 0,
          },
        })
        return NextResponse.json({
          message: 'Asistencia marcada. Último ticket utilizado. Membresía vencida.',
          ticketsRemaining: 0,
        }, { status: 201 })
      }

      return NextResponse.json({
        message: `Asistencia marcada (ticket consumido). Tickets restantes: ${remaining}`,
        ticketsRemaining: remaining,
      }, { status: 201 })
    }

    // Fallback (shouldn't reach here)
    return NextResponse.json({ error: 'Tipo de plan no reconocido' }, { status: 400 })
  } catch (error) {
    console.error('[Attendance POST]', error)
    return NextResponse.json({ error: 'Error al marcar asistencia' }, { status: 500 })
  }
}