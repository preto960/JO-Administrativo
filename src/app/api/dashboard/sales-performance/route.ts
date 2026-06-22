import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { getAppTz } from '@/lib/app-time'

// GET /api/dashboard/sales-performance?month=2025-06
// Returns per-vendor sales totals (products + renewals) + their targets for the selected month
export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if ('status' in auth) return auth

  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month') || ''

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'month es requerido (formato: 2025-06)' }, { status: 400 })
  }

  try {
    const [year, mon] = month.split('-').map(Number)
    const appTz = await getAppTz()

    // Build first and last day of month in the app's timezone
    // We use toLocaleDateString to get the correct UTC representation
    const firstDayStr = `${year}-${String(mon).padStart(2, '0')}-01`
    const firstDay = new Date(firstDayStr + 'T00:00:00')
    const lastDayDate = new Date(Date.UTC(year, mon, 0)) // last day of month in UTC
    const lastDayStr = lastDayDate.toLocaleDateString('en-CA', { timeZone: appTz.timezone })
    const lastDay = new Date(lastDayStr + 'T23:59:59.999')

    // Adjust to UTC using timezone offset
    const refDate = new Date(firstDayStr + 'T12:00:00')
    const localDate = new Date(refDate.toLocaleString('en-US', { timeZone: appTz.timezone }))
    const offsetMs = localDate.getTime() - refDate.getTime()

    const startDate = new Date(Date.UTC(year, mon - 1, 1, -offsetMs / 3600000, 0, 0, 0))
    const endDate = new Date(Date.UTC(year, mon, 0, 24 - offsetMs / 3600000, 59, 59, 999))

    const users = await db.user.findMany({
      where: { active: true, deletedAt: null, role: { in: ['admin', 'gerente', 'cajero', 'vendedor'] } },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    })

    // Get credit sale IDs to exclude from all calculations
    const creditSaleIds = (await db.accountReceivable.findMany({
      where: { sale: { date: { gte: startDate, lte: endDate } } },
      select: { saleId: true },
    })).map(r => r.saleId)

    // 1. Sum POS product sales per user (exclude credit)
    const salesByUser = await db.sale.groupBy({
      by: ['userId'],
      where: {
        status: 'completada',
        date: { gte: startDate, lte: endDate },
        ...(creditSaleIds.length > 0 ? { id: { notIn: creditSaleIds } } : {}),
        lines: { some: {} },
      },
      _sum: { total: true },
    })

    // 2. Sum renewal (subscription) sales per user (exclude credit)
    const renewalsByUser = await db.sale.groupBy({
      by: ['userId'],
      where: {
        status: 'completada',
        date: { gte: startDate, lte: endDate },
        lines: { none: {} },
        ...(creditSaleIds.length > 0 ? { id: { notIn: creditSaleIds } } : {}),
      },
      _sum: { total: true },
    })

    const salesMap = new Map(salesByUser.map(s => [s.userId, s._sum.total || 0]))
    const renewalsMap = new Map(renewalsByUser.map(r => [r.userId, r._sum.total || 0]))

    // 3. Get targets
    const targets = await db.salesTarget.findMany({
      where: { yearMonth: month },
      select: { userId: true, targetAmount: true },
    })
    const targetMap = new Map(targets.map(t => [t.userId, t.targetAmount]))

    // 4. Build result
    const performance = users.map(u => {
      const productSales = salesMap.get(u.id) || 0
      const renewalSales = renewalsMap.get(u.id) || 0
      const totalSales = Math.round((productSales + renewalSales) * 100) / 100
      const target = targetMap.get(u.id) || 0
      const achieved = target > 0 && totalSales >= target
      const remaining = target > 0 ? Math.max(0, Math.round((target - totalSales) * 100) / 100) : 0
      const percent = target > 0 ? Math.round((totalSales / target) * 100) : 0
      const overTarget = target > 0 ? Math.max(0, Math.round((totalSales - target) * 100) / 100) : 0

      return {
        userId: u.id, userName: u.name, role: u.role,
        productSales, renewalSales, totalSales, target,
        achieved, remaining, percent, overTarget,
      }
    })
    performance.sort((a, b) => b.totalSales - a.totalSales)

    const totalMonthSales = Math.round(performance.reduce((s, p) => s + p.totalSales, 0) * 100) / 100
    const totalMonthTarget = Math.round(performance.reduce((s, p) => s + p.target, 0) * 100) / 100

    return NextResponse.json({ month, performance, totalMonthSales, totalMonthTarget })
  } catch (error) {
    console.error('[SalesPerformance GET]', error)
    return NextResponse.json({ error: 'Error al obtener rendimiento' }, { status: 500 })
  }
}