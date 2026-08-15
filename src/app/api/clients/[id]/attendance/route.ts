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
          where: { status: { in: ['Activo', 'Vencido'] } },
          orderBy: { createdAt: 'desc' },
          include: { plan: true },
        },
      },
    })
    if (!client) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
    }

    // Separate gym membership from tiquetera
    const gymMembership = client.memberships.find(m => m.planType !== 'tickets') || null
    const ticketMembership = client.memberships.find(m => m.planType === 'tickets') || null
    // Primary membership for backward compat: gym if exists, else tiquetera
    const membership = gymMembership || ticketMembership
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

    // Verificar si ya se marcó asistencia hoy
    const todayDate = await fetchToday(appTz.timezone)
    const todayAttendance = attendances.find(a => {
      const attStr = a.date.toISOString().split('T')[0]
      return attStr === todayDate.toISOString().split('T')[0]
    })

    // Verificar si gym ya fue marcado hoy (independiente de tiquetera)
    const gymMarkedToday = attendances.some(a => {
      const attStr = a.date.toISOString().split('T')[0]
      return attStr === todayDate.toISOString().split('T')[0] && (a.source === 'gym' || !a.source)
    })

    // Verificar si tiquetera ya fue marcada hoy
    const tiqueteraMarkedToday = attendances.some(a => {
      const attStr = a.date.toISOString().split('T')[0]
      return attStr === todayDate.toISOString().split('T')[0] && a.source === 'tiquetera'
    })

    return NextResponse.json({
      attendances,
      stats: {
        planType,
        totalPlanDays,
        planName,
        daysRemaining,
        ticketsRemaining: ticketMembership?.ticketsRemaining || 0,
        ticketTotal: (ticketMembership?.plan) ? ticketMembership.plan.ticketCount : 0,
        startTime: membership?.startTime || membership?.plan?.startTime || null,
        endTime: membership?.endTime || membership?.plan?.endTime || null,
        totalAttendances,
        monthAttendanceCount,
        monthName: appNow.toLocaleDateString(appTz.locale, { timeZone: appTz.timezone, month: 'long', year: 'numeric' }),
        attendanceMarkedToday: !!todayAttendance,
        gymMarkedToday,
        tiqueteraMarkedToday,
        // Tiquetera info (independent from gym membership)
        tiqueteraActive: ticketMembership?.status === 'Activo',
        tiqueteraTicketsRemaining: ticketMembership?.ticketsRemaining || 0,
        tiqueteraDaysRemaining: ticketMembership?.endDate ? calcDaysRemaining(ticketMembership.endDate, todayDate) : 0,
        tiqueteraPlanName: ticketMembership?.tarifa || ticketMembership?.plan?.name || null,
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
    const body = await request.json()
    const source = body.source || 'gym' // 'gym' | 'tiquetera'

    const client = await db.client.findUnique({
      where: { id },
      include: {
        memberships: {
          where: { status: { in: ['Activo', 'Vencido'] } },
          orderBy: { createdAt: 'desc' },
          include: { plan: true },
        },
      },
    })
    if (!client) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
    }

    // Separate gym membership from tiquetera
    const gymMembership = client.memberships.find(m => m.planType !== 'tickets') || null
    const ticketMembership = client.memberships.find(m => m.planType === 'tickets') || null

    // For attendance: gym uses gym membership, tiquetera uses ticket membership
    const membership = source === 'tiquetera' ? ticketMembership : (gymMembership || ticketMembership)

    // ── Validar estado de membresía ──
    if (!membership || membership.status !== 'Activo') {
      return NextResponse.json({ error: 'El cliente no tiene una membresía activa' }, { status: 400 })
    }

    const planType = membership.planType || membership.plan?.planType || 'dias'
    const appTz = await fetchAppTz()
    const today = await fetchToday()

    // ── POR DÍAS / HORARIO (gym membership) ──
    if (planType === 'dias' || planType === 'horario') {
      // Check schedule for horario plans
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
      }

      // Check if gym already marked today
      const existingGym = await db.attendance.findFirst({
        where: {
          clientId: id,
          date: today,
          source: { in: ['gym', ''] },
        },
      })
      if (existingGym) {
        return NextResponse.json({ error: 'Ya se marcó la asistencia de gym hoy para este cliente' }, { status: 409 })
      }

      await db.$transaction([
        db.attendance.create({ data: { clientId: id, date: today, source: 'gym' } }),
        db.client.update({ where: { id }, data: { lastAttendance: new Date() } }),
      ])

      return NextResponse.json({ message: `Asistencia marcada (plan por ${planType})`, source: 'gym' }, { status: 201 })
    }

    // ── POR TICKETS (tiquetera) ──
    if (planType === 'tickets') {
      if (source === 'tiquetera') {
        // Asistencia por tiquetera: verificar que gym ya fue marcado hoy
        const existingGym = await db.attendance.findFirst({
          where: {
            clientId: id,
            date: today,
            source: { in: ['gym', ''] },
          },
        })
        if (!existingGym) {
          return NextResponse.json({ error: 'Debe marcar la asistencia de gym antes de usar tiquetera' }, { status: 400 })
        }

        // Verificar si tiquetera ya fue marcada hoy
        const existingTiquetera = await db.attendance.findFirst({
          where: { clientId: id, date: today, source: 'tiquetera' },
        })
        if (existingTiquetera) {
          return NextResponse.json({ error: 'Ya se usó tiquetera hoy para este cliente' }, { status: 409 })
        }

        if (membership.ticketsRemaining <= 0) {
          return NextResponse.json({ error: 'No hay tickets disponibles' }, { status: 400 })
        }

        const remaining = membership.ticketsRemaining - 1

        await db.$transaction([
          db.attendance.create({ data: { clientId: id, date: today, source: 'tiquetera' } }),
          db.client.update({ where: { id }, data: { lastAttendance: new Date() } }),
          db.clientMembership.update({
            where: { id: membership.id },
            data: { ticketsRemaining: { decrement: 1 } },
          }),
        ])

        // Si no quedan tickets, vencer la membresía
        if (remaining <= 0) {
          await db.clientMembership.update({
            where: { id: membership.id },
            data: { status: 'Vencido', ticketsRemaining: 0 },
          })
          return NextResponse.json({
            message: 'Asistencia por tiquetera marcada. Último ticket utilizado. Tiquetera vencida.',
            source: 'tiquetera',
            ticketsRemaining: 0,
          }, { status: 201 })
        }

        return NextResponse.json({
          message: `Asistencia por tiquetera marcada. Tickets restantes: ${remaining}`,
          source: 'tiquetera',
          ticketsRemaining: remaining,
        }, { status: 201 })

      } else if (source === 'gym') {
        // Asistencia gym normal: SOLO marcar asistencia, NO descontar ticket
        const existingGym = await db.attendance.findFirst({
          where: {
            clientId: id,
            date: today,
            source: { in: ['gym', ''] },
          },
        })
        if (existingGym) {
          return NextResponse.json({ error: 'Ya se marcó la asistencia de gym hoy para este cliente' }, { status: 409 })
        }

        await db.$transaction([
          db.attendance.create({ data: { clientId: id, date: today, source: 'gym' } }),
          db.client.update({ where: { id }, data: { lastAttendance: new Date() } }),
        ])

        return NextResponse.json({
          message: 'Asistencia gym marcada (ticket NO consumido)',
          source: 'gym',
          ticketsRemaining: membership.ticketsRemaining,
        }, { status: 201 })
      }
    }

    // Fallback
    return NextResponse.json({ error: 'Tipo de plan no reconocido' }, { status: 400 })
  } catch (error) {
    console.error('[Attendance POST]', error)
    return NextResponse.json({ error: 'Error al marcar asistencia' }, { status: 500 })
  }
}
