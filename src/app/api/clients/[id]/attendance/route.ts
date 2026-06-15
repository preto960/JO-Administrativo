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

    // Current month attendance
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const monthAttendances = attendances.filter(
      (a) => a.date >= monthStart && a.date < monthEnd
    )

    // Plan info
    const totalPlanDays = membership?.plan
      ? getPlanDays(membership.plan.durationType, membership.plan.durationDays)
      : 0
    const planName = membership?.plan?.name || membership?.tarifa || null
    const daysRemaining = membership?.daysRemaining || 0

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
        monthName: now.toLocaleDateString('es-VE', { month: 'long', year: 'numeric' }),
      },
    })
  } catch (error) {
    console.error('[Attendance GET]', error)
    return NextResponse.json({ error: 'Error al obtener asistencia' }, { status: 500 })
  }
}

// POST /api/clients/[id]/attendance — mark today's attendance
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
    const client = await db.client.findUnique({
      where: { id },
      include: {
        memberships: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    })
    if (!client) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
    }

    const membership = client.memberships[0]

    // Check membership status — allow marking even for expired (admin override)
    if (membership && membership.status === 'Vencido') {
      return NextResponse.json(
        { error: 'La membresía está vencida. Renueve el plan antes de marcar asistencia.' },
        { status: 400 }
      )
    }

    // Check days remaining
    if (membership && membership.daysRemaining <= 0 && membership.status === 'Activo') {
      // Auto-expire
      await db.clientMembership.update({
        where: { id: membership.id },
        data: { status: 'Vencido', daysRemaining: 0 },
      })
      return NextResponse.json(
        { error: 'Los días de la membresía se agotaron. Renueve el plan.' },
        { status: 400 }
      )
    }

    // Today's date (start of day for unique constraint)
    const today = new Date()
    today.setHours(0, 0, 0, 0)

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

    // Create attendance
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

    // If membership is active, decrement daysRemaining
    if (membership && membership.status === 'Activo' && membership.daysRemaining > 0) {
      const newDaysRemaining = membership.daysRemaining - 1
      const newStatus = newDaysRemaining <= 0 ? 'Vencido' : 'Activo'
      await db.clientMembership.update({
        where: { id: membership.id },
        data: {
          daysRemaining: Math.max(0, newDaysRemaining),
          status: newStatus,
        },
      })
    }

    return NextResponse.json(attendance, { status: 201 })
  } catch (error) {
    console.error('[Attendance POST]', error)
    return NextResponse.json({ error: 'Error al marcar asistencia' }, { status: 500 })
  }
}