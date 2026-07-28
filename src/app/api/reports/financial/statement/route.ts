import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'

// GET /api/reports/financial/statement — generate ERI financial statement for a date range
// Params: dateFrom, dateTo, branchId
export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if ('status' in auth) return auth

  try {
    const { searchParams } = new URL(request.url)
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const branchId = searchParams.get('branchId')

    if (!dateFrom || !dateTo) {
      return NextResponse.json({ error: 'Las fechas desde y hasta son requeridas' }, { status: 400 })
    }

    const startDate = new Date(dateFrom)
    startDate.setHours(0, 0, 0, 0)
    const endDate = new Date(dateTo)
    endDate.setHours(23, 59, 59, 999)

    // Get all active cost centers
    const costCenters = await db.costCenter.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    })

    // Get all cost entries in the date range
    const costEntries = await db.costEntry.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
      },
      include: {
        costCenter: { select: { id: true, name: true, code: true } },
        currency: { select: { id: true, code: true, symbol: true } },
      },
    })

    // Get all budgets that overlap with the date range
    // A budget covers a month (yearMonth = "YYYY-MM"), so find all months in the range
    const startYear = startDate.getFullYear()
    const startMonth = startDate.getMonth() + 1
    const endYear = endDate.getFullYear()
    const endMonth = endDate.getMonth() + 1

    const monthFilters: string[] = []
    let y = startYear
    let m = startMonth
    while (y < endYear || (y === endYear && m <= endMonth)) {
      monthFilters.push(`${y}-${String(m).padStart(2, '0')}`)
      m++
      if (m > 12) { m = 1; y++ }
    }

    const budgets = await db.expenseBudget.findMany({
      where: {
        yearMonth: { in: monthFilters },
      },
      include: {
        costCenter: { select: { id: true, name: true, code: true } },
      },
    })

    // Group entries by cost center
    const entriesByCenter = new Map<string, number>()
    for (const entry of costEntries) {
      const cid = entry.costCenterId
      const current = entriesByCenter.get(cid) || 0
      entriesByCenter.set(cid, current + entry.amount)
    }

    // Group budgets by cost center (sum budgets across all months in range)
    const budgetByCenter = new Map<string, number>()
    for (const budget of budgets) {
      const cid = budget.costCenterId
      const current = budgetByCenter.get(cid) || 0
      budgetByCenter.set(cid, current + budget.budgetAmount)
    }

    // Build ERI report per cost center
    const centers = costCenters.map((cc) => {
      const budget = budgetByCenter.get(cc.id) || 0
      const actual = entriesByCenter.get(cc.id) || 0
      const variance = budget - actual
      const percentUsed = budget > 0 ? (actual / budget) * 100 : 0

      return {
        id: cc.id,
        nombre: cc.name,
        codigo: cc.code,
        presupuesto: Math.round(budget * 100) / 100,
        gastoReal: Math.round(actual * 100) / 100,
        variacion: Math.round(variance * 100) / 100,
        porcentajeUtilizado: Math.round(percentUsed * 100) / 100,
      }
    })

    // Summary totals
    const totalPresupuesto = centers.reduce((s, c) => s + c.presupuesto, 0)
    const totalGastoReal = centers.reduce((s, c) => s + c.gastoReal, 0)
    const totalVariacion = totalPresupuesto - totalGastoReal
    const totalPorcentajeUtilizado = totalPresupuesto > 0 ? (totalGastoReal / totalPresupuesto) * 100 : 0

    // Branch info
    const branch = branchId ? await db.branch.findUnique({ where: { id: branchId }, select: { id: true, name: true } }) : null

    // Settings for business name
    const settings = await db.settings.findFirst({ select: { businessName: true } })
    const businessName = settings?.businessName || 'JO-Administrativo'

    return NextResponse.json({
      nombreEmpresa: businessName,
      fechaDesde: dateFrom,
      fechaHasta: dateTo,
      sucursal: branch ? { id: branch.id, nombre: branch.name } : null,
      generadoEn: new Date().toISOString(),
      centros: centers,
      resumen: {
        totalPresupuesto: Math.round(totalPresupuesto * 100) / 100,
        totalGastoReal: Math.round(totalGastoReal * 100) / 100,
        totalVariacion: Math.round(totalVariacion * 100) / 100,
        totalPorcentajeUtilizado: Math.round(totalPorcentajeUtilizado * 100) / 100,
      },
    })
  } catch (error) {
    console.error('[Statement GET]', error)
    return NextResponse.json({ error: 'Error al generar estado financiero' }, { status: 500 })
  }
}
