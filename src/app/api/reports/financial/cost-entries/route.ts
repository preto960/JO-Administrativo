import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { getPermissions } from '@/lib/permissions'
import { logAction } from '@/lib/audit-log'

// GET /api/reports/financial/cost-entries — list cost entries with filters and totals by cost center
export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if ('status' in auth) return auth

  try {
    const { searchParams } = new URL(request.url)
    const costCenterId = searchParams.get('costCenterId') || ''
    const dateFrom = searchParams.get('dateFrom') || ''
    const dateTo = searchParams.get('dateTo') || ''

    const where: Record<string, unknown> = {}
    if (costCenterId) where.costCenterId = costCenterId
    if (dateFrom || dateTo) {
      where.date = {}
      if (dateFrom) (where.date as Record<string, unknown>).gte = new Date(dateFrom)
      if (dateTo) {
        // Include the full end day
        const end = new Date(dateTo)
        end.setHours(23, 59, 59, 999)
        ;(where.date as Record<string, unknown>).lte = end
      }
    }

    const entries = await db.costEntry.findMany({
      where,
      include: {
        costCenter: { select: { id: true, name: true, code: true } },
        currency: { select: { id: true, code: true, symbol: true } },
        user: { select: { id: true, name: true } },
      },
      orderBy: { date: 'desc' },
    })

    // Calculate totals by cost center
    const totalsByCenter = new Map<string, { costCenterName: string; costCenterCode: string | null; total: number }>()
    for (const entry of entries) {
      const cid = entry.costCenterId
      const existing = totalsByCenter.get(cid)
      if (existing) {
        existing.total += entry.amount
      } else {
        totalsByCenter.set(cid, {
          costCenterName: entry.costCenter.name,
          costCenterCode: entry.costCenter.code,
          total: entry.amount,
        })
      }
    }

    const grandTotal = entries.reduce((sum, e) => sum + e.amount, 0)

    return NextResponse.json({
      entries,
      totalsByCenter: Object.fromEntries(totalsByCenter),
      grandTotal,
    })
  } catch (error) {
    console.error('[CostEntries GET]', error)
    return NextResponse.json({ error: 'Error al obtener registros de costo' }, { status: 500 })
  }
}

// POST /api/reports/financial/cost-entries — create a new cost entry (admin/gerente only)
export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if ('status' in auth) return auth
  const perms = getPermissions(auth.role)
  if (!perms.canManageExpenses) {
    return NextResponse.json({ error: 'Sin permisos. Solo administradores o gerentes.' }, { status: 403 })
  }

  try {
    const body = await request.json()

    const costCenterId = body.costCenterId?.trim()
    if (!costCenterId) {
      return NextResponse.json({ error: 'El centro de costo es requerido' }, { status: 400 })
    }

    const concept = body.concept?.trim()
    if (!concept) {
      return NextResponse.json({ error: 'El concepto es requerido' }, { status: 400 })
    }

    if (typeof body.amount !== 'number' || isNaN(body.amount) || body.amount <= 0) {
      return NextResponse.json({ error: 'El monto debe ser un número mayor a cero' }, { status: 400 })
    }

    const currencyId = body.currencyId?.trim()
    if (!currencyId) {
      return NextResponse.json({ error: 'La moneda es requerida' }, { status: 400 })
    }

    // Verify cost center exists
    const centerExists = await db.costCenter.findUnique({ where: { id: costCenterId } })
    if (!centerExists) {
      return NextResponse.json({ error: 'Centro de costo no encontrado' }, { status: 404 })
    }

    const entry = await db.costEntry.create({
      data: {
        costCenterId,
        concept,
        amount: body.amount,
        currencyId,
        date: body.date ? new Date(body.date) : new Date(),
        userId: auth.userId,
      },
      include: {
        costCenter: { select: { id: true, name: true, code: true } },
        currency: { select: { id: true, code: true, symbol: true } },
        user: { select: { id: true, name: true } },
      },
    })

    await logAction({
      action: 'create',
      entity: 'costEntry',
      entityId: entry.id,
      details: { concept, amount: body.amount, costCenterId },
      request,
    })
    return NextResponse.json(entry, { status: 201 })
  } catch (error) {
    console.error('[CostEntries POST]', error)
    return NextResponse.json({ error: 'Error al crear registro de costo' }, { status: 500 })
  }
}
