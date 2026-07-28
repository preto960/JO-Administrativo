import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { getPermissions } from '@/lib/permissions'
import { logAction } from '@/lib/audit-log'

// GET /api/reports/financial/budgets — list budgets with filters and actual spend
export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if ('status' in auth) return auth

  try {
    const { searchParams } = new URL(request.url)
    const yearMonth = searchParams.get('yearMonth') || ''
    const costCenterId = searchParams.get('costCenterId') || ''

    const where: Record<string, unknown> = {}
    if (yearMonth) where.yearMonth = yearMonth
    if (costCenterId) where.costCenterId = costCenterId

    const budgets = await db.expenseBudget.findMany({
      where,
      include: {
        costCenter: { select: { id: true, name: true, code: true } },
      },
      orderBy: [{ yearMonth: 'desc' }, { costCenter: { name: 'asc' } }],
    })

    // For each budget, calculate actual spend from CostEntry for that center + month
    const results = await Promise.all(
      budgets.map(async (budget) => {
        const [year, month] = budget.yearMonth.split('-').map(Number)
        const monthStart = new Date(year, month - 1, 1)
        const monthEnd = new Date(year, month, 1) // first day of next month

        const actualEntries = await db.costEntry.findMany({
          where: {
            costCenterId: budget.costCenterId,
            date: { gte: monthStart, lt: monthEnd },
          },
          select: { amount: true, currencyId: true, currency: { select: { symbol: true, code: true } } },
        })

        const actualSpend = actualEntries.reduce((sum, e) => sum + e.amount, 0)
        const variance = budget.budgetAmount - actualSpend
        const percentUsed = budget.budgetAmount > 0 ? (actualSpend / budget.budgetAmount) * 100 : 0

        return {
          ...budget,
          actualSpend,
          variance,
          percentUsed: Math.round(percentUsed * 100) / 100,
        }
      })
    )

    return NextResponse.json(results)
  } catch (error) {
    console.error('[Budgets GET]', error)
    return NextResponse.json({ error: 'Error al obtener presupuestos' }, { status: 500 })
  }
}

// POST /api/reports/financial/budgets — create or update budget for a cost center + month (upsert)
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

    const yearMonth = body.yearMonth?.trim()
    if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) {
      return NextResponse.json({ error: 'El período (yearMonth) es requerido en formato YYYY-MM' }, { status: 400 })
    }

    if (typeof body.budgetAmount !== 'number' || isNaN(body.budgetAmount) || body.budgetAmount < 0) {
      return NextResponse.json({ error: 'El monto del presupuesto debe ser un número no negativo' }, { status: 400 })
    }

    // Verify cost center exists
    const centerExists = await db.costCenter.findUnique({ where: { id: costCenterId } })
    if (!centerExists) {
      return NextResponse.json({ error: 'Centro de costo no encontrado' }, { status: 404 })
    }

    const budget = await db.expenseBudget.upsert({
      where: {
        costCenterId_yearMonth: { costCenterId, yearMonth },
      },
      create: {
        costCenterId,
        yearMonth,
        budgetAmount: body.budgetAmount,
      },
      update: {
        budgetAmount: body.budgetAmount,
      },
      include: {
        costCenter: { select: { id: true, name: true, code: true } },
      },
    })

    await logAction({
      action: budget.createdAt.getTime() === budget.updatedAt.getTime() ? 'create' : 'update',
      entity: 'expenseBudget',
      entityId: budget.id,
      details: { costCenterId, yearMonth, budgetAmount: body.budgetAmount },
      request,
    })

    return NextResponse.json(budget, { status: 201 })
  } catch (error) {
    console.error('[Budgets POST]', error)
    return NextResponse.json({ error: 'Error al guardar presupuesto' }, { status: 500 })
  }
}

// PUT /api/reports/financial/budgets — update budget amount
export async function PUT(request: NextRequest) {
  const auth = await requireAuth()
  if ('status' in auth) return auth
  const perms = getPermissions(auth.role)
  if (!perms.canManageExpenses) {
    return NextResponse.json({ error: 'Sin permisos. Solo administradores o gerentes.' }, { status: 403 })
  }

  try {
    const body = await request.json()

    const id = body.id?.trim()
    if (!id) {
      return NextResponse.json({ error: 'El ID del presupuesto es requerido' }, { status: 400 })
    }

    if (typeof body.budgetAmount !== 'number' || isNaN(body.budgetAmount) || body.budgetAmount < 0) {
      return NextResponse.json({ error: 'El monto del presupuesto debe ser un número no negativo' }, { status: 400 })
    }

    const existing = await db.expenseBudget.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Presupuesto no encontrado' }, { status: 404 })
    }

    const budget = await db.expenseBudget.update({
      where: { id },
      data: { budgetAmount: body.budgetAmount },
      include: {
        costCenter: { select: { id: true, name: true, code: true } },
      },
    })

    await logAction({
      action: 'update',
      entity: 'expenseBudget',
      entityId: budget.id,
      details: { oldAmount: existing.budgetAmount, newAmount: body.budgetAmount },
      request,
    })

    return NextResponse.json(budget)
  } catch (error) {
    console.error('[Budgets PUT]', error)
    return NextResponse.json({ error: 'Error al actualizar presupuesto' }, { status: 500 })
  }
}
