import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { getPermissions } from '@/lib/permissions'
import { logAction } from '@/lib/audit-log'

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

/** Get today at midnight in Colombia timezone */
function getTodayBogota(): Date {
  const now = new Date()
  const bogota = new Date(now.toLocaleString('en-US', { timeZone: 'America/Bogota' }))
  bogota.setHours(0, 0, 0, 0)
  return bogota
}

// POST /api/clients/[id]/renew — assign/renew a plan for a client
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
    const body = await request.json()
    const { planId } = body

    if (!planId) {
      return NextResponse.json({ error: 'Debes seleccionar un plan' }, { status: 400 })
    }

    const client = await db.client.findUnique({ where: { id } })
    if (!client) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
    }

    const plan = await db.plan.findUnique({ where: { id: planId } })
    if (!plan) {
      return NextResponse.json({ error: 'Plan no encontrado' }, { status: 404 })
    }
    if (!plan.active) {
      return NextResponse.json({ error: 'Este plan está inactivo' }, { status: 400 })
    }

    const totalDays = getPlanDays(plan.durationType, plan.durationDays)
    const startDate = getTodayBogota()
    const endDate = new Date(startDate)
    endDate.setDate(endDate.getDate() + totalDays)

    // Create or update the latest membership
    const existingMembership = await db.clientMembership.findFirst({
      where: { clientId: id },
      orderBy: { createdAt: 'desc' },
    })

    let membership
    if (existingMembership) {
      membership = await db.clientMembership.update({
        where: { id: existingMembership.id },
        data: {
          status: 'Activo',
          planId: plan.id,
          tarifa: plan.name,
          paymentDate: new Date(),
          startDate,
          endDate,
          daysRemaining: totalDays,
          ticketsRemaining: totalDays,
        },
      })
    } else {
      membership = await db.clientMembership.create({
        data: {
          clientId: id,
          status: 'Activo',
          planId: plan.id,
          tarifa: plan.name,
          paymentDate: new Date(),
          startDate,
          endDate,
          daysRemaining: totalDays,
          ticketsRemaining: totalDays,
        },
      })
    }

    await logAction({
      action: 'update',
      entity: 'client',
      entityId: id,
      details: {
        action: 'renew_plan',
        planName: plan.name,
        planId: plan.id,
        totalDays,
        endDate: endDate.toISOString(),
      },
      request,
    })

    return NextResponse.json({
      membership,
      message: `Plan "${plan.name}" asignado (${totalDays} días)`,
    }, { status: 201 })
  } catch (error) {
    console.error('[Renew POST]', error)
    return NextResponse.json({ error: 'Error al renovar suscripción' }, { status: 500 })
  }
}