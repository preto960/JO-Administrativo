import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { getPermissions } from '@/lib/permissions'
import { todayApp, nowApp, monthStartApp, monthEndApp, getAppTz } from '@/lib/app-time'

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

async function calcDaysRemaining(endDate: Date): Promise<number> {
  const today = await todayApp()
  const end = new Date(endDate)
  const diff = end.getTime() - today.getTime()
  const days = diff / (1000 * 60 * 60 * 24)
  return Math.max(0, Math.round(days))
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
    const appTz = await getAppTz()

    const attendances = await db.attendance.findMany({
      where: { clientId: id },
      orderBy: { date: 'desc' },
    })

    const appNow = await nowApp()
    const monthStart = await monthStartApp(appNow)
    const monthEnd = await monthEndApp(appNow)
    const monthAttendances = attendances.filter(
      (a) => a.date >= monthStart && a.date < monthEnd
    )

    const totalPlanDays = membership?.plan
      ? getPlanDays(membership.plan.durationType, membership.plan.durationDays)
      : (membership?.daysRemaining || 0)
    const planName = membership?.plan?.name || membership?.tarifa || null
    const daysRemaining = membership?.endDate
      ? await calcDaysRemaining(membership.endDate)
      : (membership?.daysRemaining || 0)

    const totalAttendances = attendances.length
    const monthAttendanceCount = monthAttendances.length

    return NextResponse.json({
      attendances,
      stats: {
        totalPlanDays,
        planName,
        daysRemaining,
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
    const client = await db.client.findUnique({ where: { id } })
    if (!client) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
    }

    const today = await todayApp()

    const existing = await db.attendance.findUnique({
      where: {
        clientId_date: {
          clientId: id,
          date: today,
        },
      },
    })
    if (existing) {
      return NextResponse.json({ error: 'Ya se marcó la asistencia de hoy para este cliente' }, { status: 409 })
    }

    const attendance = await db.attendance.create({
      data: {
        clientId: id,
        date: today,
      },
    })

    await db.client.update({
      where: { id },
      data: { lastAttendance: new Date() },
    })

    return NextResponse.json(attendance, { status: 201 })
  } catch (error) {
    console.error('[Attendance POST]', error)
    return NextResponse.json({ error: 'Error al marcar asistencia' }, { status: 500 })
  }
}