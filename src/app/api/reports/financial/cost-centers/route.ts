import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { getPermissions } from '@/lib/permissions'
import { logAction } from '@/lib/audit-log'

// GET /api/reports/financial/cost-centers — list all cost centers with entry/budget counts
export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if ('status' in auth) return auth

  try {
    const { searchParams } = new URL(request.url)
    const activeParam = searchParams.get('active')

    const where: Record<string, unknown> = {}
    if (activeParam !== null && activeParam !== '') {
      where.active = activeParam === 'true'
    }

    const costCenters = await db.costCenter.findMany({
      where,
      include: {
        _count: {
          select: { entries: true, budgets: true },
        },
      },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json(costCenters)
  } catch (error) {
    console.error('[CostCenters GET]', error)
    return NextResponse.json({ error: 'Error al obtener centros de costo' }, { status: 500 })
  }
}

// POST /api/reports/financial/cost-centers — create a new cost center (admin/gerente only)
export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if ('status' in auth) return auth
  const perms = getPermissions(auth.role)
  if (!perms.canManageExpenses) {
    return NextResponse.json({ error: 'Sin permisos. Solo administradores o gerentes.' }, { status: 403 })
  }

  try {
    const body = await request.json()

    const name = body.name?.trim()
    if (!name) {
      return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 })
    }

    const code = body.code?.trim() || null

    // Check uniqueness
    const existing = await db.costCenter.findFirst({
      where: {
        OR: [{ name }, ...(code ? [{ code }] : [])],
      },
    })
    if (existing) {
      return NextResponse.json({ error: 'Ya existe un centro de costo con ese nombre o código' }, { status: 409 })
    }

    const costCenter = await db.costCenter.create({
      data: {
        name,
        code,
        active: body.active !== undefined ? body.active : true,
      },
    })

    await logAction({ action: 'create', entity: 'costCenter', entityId: costCenter.id, details: { name, code }, request })
    return NextResponse.json(costCenter, { status: 201 })
  } catch (error) {
    console.error('[CostCenters POST]', error)
    return NextResponse.json({ error: 'Error al crear centro de costo' }, { status: 500 })
  }
}
