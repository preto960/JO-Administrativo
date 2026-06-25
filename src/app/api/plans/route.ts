import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { getPermissions } from '@/lib/permissions'

const VALID_DURATION_TYPES = ['1_mes', 'bimestral', 'anual', 'dia', 'otro'] as const
const VALID_PLAN_TYPES = ['dias', 'horario', 'tickets'] as const

export async function GET() {
  const auth = await requireAuth()
  if ('status' in auth) return auth
  // GET is read-only (used in selectors) — any authenticated user can fetch plans

  try {
    const plans = await db.plan.findMany({
      orderBy: { createdAt: 'asc' },
    })
    return NextResponse.json(plans)
  } catch (error) {
    console.error('[Plans GET]', error)
    return NextResponse.json({ error: 'Error al obtener planes' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if ('status' in auth) return auth
  const perms = getPermissions(auth.role)
  if (!perms.canManageClients) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { name, planType, durationType, durationDays, ticketCount, startTime, endTime, cost, description } = body

    if (!name?.trim()) {
      return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
    }

    const resolvedPlanType = planType || 'dias'
    if (!VALID_PLAN_TYPES.includes(resolvedPlanType)) {
      return NextResponse.json({ error: 'Tipo de plan inválido' }, { status: 400 })
    }

    // Validations per planType
    if (resolvedPlanType === 'dias') {
      if (!durationType || !VALID_DURATION_TYPES.includes(durationType)) {
        return NextResponse.json({ error: 'Tipo de duración inválido' }, { status: 400 })
      }
      if (durationType === 'otro' && (!durationDays || durationDays <= 0)) {
        return NextResponse.json({ error: 'Debes especificar los días para duración personalizada' }, { status: 400 })
      }
    }

    if (resolvedPlanType === 'horario') {
      if (!startTime || !endTime) {
        return NextResponse.json({ error: 'Debes especificar la hora de inicio y fin' }, { status: 400 })
      }
    }

    if (resolvedPlanType === 'tickets') {
      if (!ticketCount || ticketCount <= 0) {
        return NextResponse.json({ error: 'Debes especificar la cantidad de tickets' }, { status: 400 })
      }
    }

    const plan = await db.plan.create({
      data: {
        name: name.trim(),
        planType: resolvedPlanType,
        durationType: resolvedPlanType === 'dias' ? (durationType || '1_mes') : '1_mes',
        durationDays: resolvedPlanType === 'dias' && durationType === 'otro' ? Number(durationDays) : null,
        ticketCount: resolvedPlanType === 'tickets' ? Number(ticketCount) : 0,
        startTime: resolvedPlanType === 'horario' ? startTime : null,
        endTime: resolvedPlanType === 'horario' ? endTime : null,
        cost: Number(cost) || 0,
        description: description?.trim() || null,
      },
    })

    return NextResponse.json(plan, { status: 201 })
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'P2002') {
      return NextResponse.json({ error: 'Ya existe un plan con ese nombre' }, { status: 409 })
    }
    console.error('[Plans POST]', error)
    return NextResponse.json({ error: 'Error al crear plan' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth()
  if ('status' in auth) return auth
  const perms = getPermissions(auth.role)
  if (!perms.canManageClients) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { id, name, planType, durationType, durationDays, ticketCount, startTime, endTime, cost, description, active } = body

    if (!id) {
      return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
    }
    if (!name?.trim()) {
      return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
    }

    const resolvedPlanType = planType || 'dias'
    if (!VALID_PLAN_TYPES.includes(resolvedPlanType)) {
      return NextResponse.json({ error: 'Tipo de plan inválido' }, { status: 400 })
    }

    // Validations per planType
    if (resolvedPlanType === 'dias' && durationType && !VALID_DURATION_TYPES.includes(durationType)) {
      return NextResponse.json({ error: 'Tipo de duración inválido' }, { status: 400 })
    }
    if (resolvedPlanType === 'dias' && durationType === 'otro' && (!durationDays || durationDays <= 0)) {
      return NextResponse.json({ error: 'Debes especificar los días para duración personalizada' }, { status: 400 })
    }
    if (resolvedPlanType === 'horario' && (!startTime || !endTime)) {
      return NextResponse.json({ error: 'Debes especificar la hora de inicio y fin' }, { status: 400 })
    }
    if (resolvedPlanType === 'tickets' && (!ticketCount || ticketCount <= 0)) {
      return NextResponse.json({ error: 'Debes especificar la cantidad de tickets' }, { status: 400 })
    }

    const plan = await db.plan.update({
      where: { id },
      data: {
        name: name.trim(),
        planType: resolvedPlanType,
        durationType: resolvedPlanType === 'dias' ? (durationType || '1_mes') : '1_mes',
        durationDays: resolvedPlanType === 'dias' && durationType === 'otro' ? Number(durationDays) : null,
        ticketCount: resolvedPlanType === 'tickets' ? Number(ticketCount) : 0,
        startTime: resolvedPlanType === 'horario' ? startTime : null,
        endTime: resolvedPlanType === 'horario' ? endTime : null,
        cost: cost !== undefined ? Number(cost) : undefined,
        description: description !== undefined ? (description?.trim() || null) : undefined,
        active: active !== undefined ? active : undefined,
      },
    })

    return NextResponse.json(plan)
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'P2002') {
      return NextResponse.json({ error: 'Ya existe un plan con ese nombre' }, { status: 409 })
    }
    console.error('[Plans PUT]', error)
    return NextResponse.json({ error: 'Error al actualizar plan' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth()
  if ('status' in auth) return auth
  const perms = getPermissions(auth.role)
  if (!perms.canManageClients) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
    }

    await db.plan.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'P2025') {
      return NextResponse.json({ error: 'Plan no encontrado' }, { status: 404 })
    }
    console.error('[Plans DELETE]', error)
    return NextResponse.json({ error: 'Error al eliminar plan' }, { status: 500 })
  }
}