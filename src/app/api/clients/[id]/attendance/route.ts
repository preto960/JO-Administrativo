import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { getPermissions } from '@/lib/permissions'

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

/** Get today's date in Colombia timezone (America/Bogota) */
function getTodayBogota(): Date {
  const now = new Date()
  const bogota = new Date(now.toLocaleString('en-US', { timeZone: 'America/Bogota' }))
  bogota.setHours(0, 0, 0, 0)
  return bogota
}

/** Get days remaining between now (Bogota) and endDate */
function calcDaysRemaining(endDate: Date): number {
  const today = getTodayBogota()
  const end = new Date(endDate)
  end.setHours(23, 59, 59, 999)
  const diff = end.getTime() - today.getTime()
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}

// GET /api/clients/[id]/attendance — get attendance history + stats
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if ('status' in auth) return auth
  const perms = getPermissions(auth.role)
  if (!perms.canManageClients) {
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

    // All attendance records ordered by date desc
    const attendances = await db.attendance.findMany({
      where: { clientId: id },
      orderBy: { date: 'desc' },
    })

    // Current month attendance (Bogota timezone)
    const bogotaNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }))
    const monthStart = new Date(bogotaNow.getFullYear(), bogotaNow.getMonth(), 1)
    const monthEnd = new Date(bogotaNow.getFullYear(), bogotaNow.getMonth() + 1, 1)
    const monthAttendances = attendances.filter(
      (a) => a.date >= monthStart && a.date < monthEnd
    )

    // Plan info — days remaining calculated dynamically
    const totalPlanDays = membership?.plan
      ? getPlanDays(membership.plan.durationType, membership.plan.durationDays)
      : 0
    const planName = membership?.plan?.name || membership?.tarifa || null
    const daysRemaining = membership?.endDate
      ? calcDaysRemaining(membership.endDate)
      : 0

    // Stats
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
        monthName: bogotaNow.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' }),
      },
    })
  } catch (error) {
    console.error('[Attendance GET]', error)
    return NextResponse.json({ error: 'Error al obtener asistencia' }, { status: 500 })
  }
}

// POST /api/clients/[id]/attendance — mark today's attendance (Bogota timezone)
// Attendance is purely for tracking — it does NOT deduct days
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if ('status' in auth) return auth
  const perms = getPermissions(auth.role)
  if (!perms.canManageClients) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const { id } = await params

  try {
    const client = await db.client.findUnique({ where: { id } })
    if (!client) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
    }

    // Today in Bogota timezone (start of day)
    const today = getTodayBogota()

    // Check if already marked today
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

    // Create attendance record only
    const attendance = await db.attendance.create({
      data: {
        clientId: id,
        date: today,
      },
    })

    // Update client lastAttendance
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