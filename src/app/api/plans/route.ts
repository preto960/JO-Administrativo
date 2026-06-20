import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { getPermissions } from '@/lib/permissions'

const VALID_DURATION_TYPES = ['1_mes', 'bimestral', 'anual', 'dia', 'otro'] as const

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
    const { name, durationType, durationDays, cost, description } = body

    if (!name?.trim()) {
      return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
    }
    if (!durationType || !VALID_DURATION_TYPES.includes(durationType)) {
      return NextResponse.json({ error: 'Tipo de duración inválido' }, { status: 400 })
    }
    if (durationType === 'otro' && (!durationDays || durationDays <= 0)) {
      return NextResponse.json({ error: 'Debes especificar los días para duración personalizada' }, { status: 400 })
    }

    const plan = await db.plan.create({
      data: {
        name: name.trim(),
        durationType,
        durationDays: durationType === 'otro' ? Number(durationDays) : null,
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
    const { id, name, durationType, durationDays, cost, description, active } = body

    if (!id) {
      return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
    }
    if (!name?.trim()) {
      return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
    }
    if (durationType && !VALID_DURATION_TYPES.includes(durationType)) {
      return NextResponse.json({ error: 'Tipo de duración inválido' }, { status: 400 })
    }
    if (durationType === 'otro' && (!durationDays || durationDays <= 0)) {
      return NextResponse.json({ error: 'Debes especificar los días para duración personalizada' }, { status: 400 })
    }

    const plan = await db.plan.update({
      where: { id },
      data: {
        name: name.trim(),
        durationType: durationType || undefined,
        durationDays: durationType === 'otro' ? Number(durationDays) : null,
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