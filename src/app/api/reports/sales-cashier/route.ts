import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { fetchAppTz } from '@/lib/tz-helpers'

// GET /api/reports/sales-cashier?dateFrom=2025-07-01&dateTo=2025-07-15&branchId=xxx&userId=xxx
export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if ('status' in auth) return auth

  const { searchParams } = new URL(request.url)
  const dateFrom = searchParams.get('dateFrom')
  const dateTo = searchParams.get('dateTo')
  const branchId = searchParams.get('branchId') || undefined
  const userId = searchParams.get('userId') || undefined

  if (!dateFrom || !dateTo) {
    return NextResponse.json({ error: 'dateFrom y dateTo son requeridos' }, { status: 400 })
  }

  try {
    const appTz = await fetchAppTz()

    const startDate = new Date(dateFrom + 'T00:00:00')
    const endDate = new Date(dateTo + 'T23:59:59.999')

    const refDate = new Date(dateFrom + 'T12:00:00')
    const localDate = new Date(refDate.toLocaleString('en-US', { timeZone: appTz.timezone }))
    const offsetMs = localDate.getTime() - refDate.getTime()
    const offsetHours = offsetMs / 3600000

    const utcStart = new Date(Date.UTC(
      startDate.getFullYear(), startDate.getMonth(), startDate.getDate(),
      -offsetHours, 0, 0, 0
    ))
    const utcEnd = new Date(Date.UTC(
      endDate.getFullYear(), endDate.getMonth(), endDate.getDate(),
      24 - offsetHours, 59, 59, 999
    ))

    const fromDate = new Date(dateFrom + 'T12:00:00')
    const localFromDate = new Date(fromDate.toLocaleString('en-US', { timeZone: appTz.timezone }))
    const dayOfWeek = localFromDate.getDay()
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    const weekStart = new Date(localFromDate)
    weekStart.setDate(localFromDate.getDate() + mondayOffset)
    const weekStartStr = weekStart.toLocaleDateString('en-CA', { timeZone: appTz.timezone })
    const weekStartUtc = new Date(Date.UTC(
      weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate(),
      -offsetHours, 0, 0, 0
    ))
    const weekEndUtc = new Date(Date.UTC(
      weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6,
      24 - offsetHours, 59, 59, 999
    ))

    const [year, mon] = dateFrom.slice(0, 7).split('-').map(Number)
    const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate()
    const monthStartUtc = new Date(Date.UTC(year, mon - 1, 1, -offsetHours, 0, 0, 0))
    const monthEndUtc = new Date(Date.UTC(year, mon, lastDay, 24 - offsetHours, 59, 59, 999))

    const yearMonth = dateFrom.slice(0, 7)

    const whereUsers: Record<string, unknown> = {
      role: { in: ['cajero', 'vendedor', 'gerente', 'admin'] },
      ...(userId ? { id: userId } : {}),
    }

    const cashiers = await db.user.findMany({
      where: whereUsers,
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    })

    const creditSaleIds = (await db.accountReceivable.findMany({
      where: { sale: { date: { gte: utcStart, lte: utcEnd } } },
      select: { saleId: true },
    })).map(r => r.saleId)

    const baseSaleWhere = {
      status: 'completada' as const,
      date: { gte: utcStart, lte: utcEnd },
      ...(creditSaleIds.length > 0 ? { id: { notIn: creditSaleIds } } : {}),
      ...(branchId ? { branchId } : {}),
    }

    const results = []

    for (const cashier of cashiers) {
      const userFilter = { ...baseSaleWhere, userId: cashier.id }

      const dailySalesAgg = await db.sale.aggregate({
        where: userFilter,
        _sum: { total: true },
      })
      const dailySales = Math.round((dailySalesAgg._sum.total || 0) * 100) / 100

      const weekCreditSaleIds = (await db.accountReceivable.findMany({
        where: { sale: { date: { gte: weekStartUtc, lte: weekEndUtc } } },
        select: { saleId: true },
      })).map(r => r.saleId)

      const weeklySalesAgg = await db.sale.aggregate({
        where: {
          status: 'completada',
          userId: cashier.id,
          date: { gte: weekStartUtc, lte: weekEndUtc },
          ...(weekCreditSaleIds.length > 0 ? { id: { notIn: weekCreditSaleIds } } : {}),
          ...(branchId ? { branchId } : {}),
        },
        _sum: { total: true },
      })
      const weeklySales = Math.round((weeklySalesAgg._sum.total || 0) * 100) / 100

      const monthCreditSaleIds = (await db.accountReceivable.findMany({
        where: { sale: { date: { gte: monthStartUtc, lte: monthEndUtc } } },
        select: { saleId: true },
      })).map(r => r.saleId)

      const monthlySalesAgg = await db.sale.aggregate({
        where: {
          status: 'completada',
          userId: cashier.id,
          date: { gte: monthStartUtc, lte: monthEndUtc },
          ...(monthCreditSaleIds.length > 0 ? { id: { notIn: monthCreditSaleIds } } : {}),
          ...(branchId ? { branchId } : {}),
        },
        _sum: { total: true },
      })
      const monthlySales = Math.round((monthlySalesAgg._sum.total || 0) * 100) / 100

      const categoryBreakdown = await db.saleLine.groupBy({
        by: ['productId'],
        where: { sale: userFilter },
        _sum: { lineTotal: true },
      })

      const productIds = categoryBreakdown.map(c => c.productId)
      const products = productIds.length > 0
        ? await db.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, category: { select: { name: true } } },
          })
        : []
      const productCategoryMap = new Map(products.map(p => [p.id, p.category?.name || 'Sin categor\u00eda']))

      const categoryMap = new Map<string, number>()
      for (const item of categoryBreakdown) {
        const catName = productCategoryMap.get(item.productId) || 'Sin categor\u00eda'
        categoryMap.set(catName, Math.round(((categoryMap.get(catName) || 0) + (item._sum.lineTotal || 0)) * 100) / 100)
      }
      const categories = Array.from(categoryMap.entries()).map(([name, total]) => ({ name, total }))

      const target = await db.salesTarget.findUnique({
        where: { userId_yearMonth: { userId: cashier.id, yearMonth } },
        select: { targetAmount: true, dailyTargetAmount: true, applyDailyAllMonth: true },
      })

      let dailyTarget = target?.dailyTargetAmount || 0
      if (!dailyTarget && target?.targetAmount && target.targetAmount > 0) {
        let workingDays = 0
        const d = new Date(Date.UTC(year, mon - 1, 1))
        while (d.getUTCMonth() === mon - 1 && d.getUTCFullYear() === year) {
          const dow = d.getUTCDay()
          if (dow !== 0 && dow !== 6) workingDays++
          d.setUTCDate(d.getUTCDate() + 1)
        }
        dailyTarget = workingDays > 0 ? Math.round((target.targetAmount / workingDays) * 100) / 100 : 0
      }

      const dailyPct = dailyTarget > 0 ? Math.round((dailySales / dailyTarget) * 100) : 0

      results.push({
        userId: cashier.id,
        userName: cashier.name,
        role: cashier.role,
        dailySales,
        weeklySales,
        monthlySales,
        dailyTarget,
        monthlyTarget: target?.targetAmount || 0,
        dailyPct,
        applyDailyAllMonth: target?.applyDailyAllMonth || false,
        categories,
      })
    }

    results.sort((a, b) => b.dailySales - a.dailySales)

    return NextResponse.json({
      dateFrom,
      dateTo,
      branchId: branchId || null,
      yearMonth,
      cashiers: results,
    })
  } catch (error) {
    console.error('[SalesCashierReport GET]', error)
    return NextResponse.json({ error: 'Error al generar reporte de ventas' }, { status: 500 })
  }
}