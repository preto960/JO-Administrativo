import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { fetchAppTz } from '@/lib/tz-helpers'

// GET /api/dashboard/my-daily-target
// Returns the current user's daily target progress for today
export async function GET() {
  const auth = await requireAuth()
  if ('status' in auth) return auth

  try {
    const userId = auth.userId
    const appTz = await fetchAppTz()

    // Get current month in YYYY-MM format
    const now = new Date()
    const localStr = now.toLocaleString('en-US', { timeZone: appTz.timezone })
    const localNow = new Date(localStr)
    const yearMonth = `${localNow.getFullYear()}-${String(localNow.getMonth() + 1).padStart(2, '0')}`
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: appTz.timezone })

    // Get target for this month
    const target = await db.salesTarget.findUnique({
      where: { userId_yearMonth: { userId, yearMonth } },
      select: { targetAmount: true, dailyTargetAmount: true, applyDailyAllMonth: true },
    })

    const dailyTarget = target?.dailyTargetAmount || 0
    const monthlyTarget = target?.targetAmount || 0
    const applyDailyAllMonth = target?.applyDailyAllMonth || false

    if (dailyTarget <= 0) {
      return NextResponse.json({
        dailyTarget: 0,
        monthlyTarget,
        dailySales: 0,
        dailyPct: 0,
        dailyAchieved: false,
        dailyRemaining: 0,
        applyDailyAllMonth,
        monthTotalSales: 0,
        monthPct: 0,
        todayStr,
        yearMonth,
      })
    }

    // Calculate today's sales for this user
    const todayStart = new Date(todayStr + 'T00:00:00')
    const todayEnd = new Date(todayStr + 'T23:59:59.999')

    // Adjust to UTC
    const refDate = new Date(todayStr + 'T12:00:00')
    const localDate = new Date(refDate.toLocaleString('en-US', { timeZone: appTz.timezone }))
    const offsetMs = localDate.getTime() - refDate.getTime()
    const offsetHours = offsetMs / 3600000

    const startDate = new Date(Date.UTC(
      todayStart.getFullYear(), todayStart.getMonth(), todayStart.getDate(),
      -offsetHours, 0, 0, 0
    ))
    const endDate = new Date(Date.UTC(
      todayEnd.getFullYear(), todayEnd.getMonth(), todayEnd.getDate(),
      24 - offsetHours, 59, 59, 999
    ))

    // Get credit sale IDs to exclude
    const creditSaleIds = (await db.accountReceivable.findMany({
      where: { sale: { date: { gte: startDate, lte: endDate } } },
      select: { saleId: true },
    })).map(r => r.saleId)

    // POS product sales today
    const salesToday = await db.sale.aggregate({
      where: {
        userId,
        status: 'completada',
        date: { gte: startDate, lte: endDate },
        ...(creditSaleIds.length > 0 ? { id: { notIn: creditSaleIds } } : {}),
        lines: { some: {} },
      },
      _sum: { total: true },
    })

    // Renewal sales today
    const renewalsToday = await db.sale.aggregate({
      where: {
        userId,
        status: 'completada',
        date: { gte: startDate, lte: endDate },
        lines: { none: {} },
        ...(creditSaleIds.length > 0 ? { id: { notIn: creditSaleIds } } : {}),
      },
      _sum: { total: true },
    })

    // Collected credit payments today attributed to this user
    const collectedToday = await db.clientPayment.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        receivable: { createdById: userId },
      },
      select: { amount: true },
    })
    const collectedTotal = collectedToday.reduce((sum, p) => sum + p.amount, 0)

    const productSales = salesToday._sum.total || 0
    const renewalSales = renewalsToday._sum.total || 0
    const dailySales = Math.round((productSales + renewalSales + collectedTotal) * 100) / 100

    const dailyPct = Math.round((dailySales / dailyTarget) * 100)
    const dailyAchieved = dailySales >= dailyTarget
    const dailyRemaining = Math.max(0, Math.round((dailyTarget - dailySales) * 100) / 100)

    // Also get monthly progress
    const [year, mon] = yearMonth.split('-').map(Number)
    const firstDayStr = `${year}-${String(mon).padStart(2, '0')}-01`
    const monthStart = new Date(Date.UTC(year, mon - 1, 1, -offsetHours, 0, 0, 0))
    const monthEnd = new Date(Date.UTC(year, mon, 0, 24 - offsetHours, 59, 59, 999))

    const monthCreditSaleIds = (await db.accountReceivable.findMany({
      where: { sale: { date: { gte: monthStart, lte: monthEnd } } },
      select: { saleId: true },
    })).map(r => r.saleId)

    const monthSales = await db.sale.aggregate({
      where: {
        userId,
        status: 'completada',
        date: { gte: monthStart, lte: monthEnd },
        ...(monthCreditSaleIds.length > 0 ? { id: { notIn: monthCreditSaleIds } } : {}),
        lines: { some: {} },
      },
      _sum: { total: true },
    })

    const monthRenewals = await db.sale.aggregate({
      where: {
        userId,
        status: 'completada',
        date: { gte: monthStart, lte: monthEnd },
        lines: { none: {} },
        ...(monthCreditSaleIds.length > 0 ? { id: { notIn: monthCreditSaleIds } } : {}),
      },
      _sum: { total: true },
    })

    const monthCollected = await db.clientPayment.findMany({
      where: {
        createdAt: { gte: monthStart, lte: monthEnd },
        receivable: { createdById: userId },
      },
      select: { amount: true },
    })
    const monthCollectedTotal = monthCollected.reduce((sum, p) => sum + p.amount, 0)

    const monthTotalSales = Math.round(((monthSales._sum.total || 0) + (monthRenewals._sum.total || 0) + monthCollectedTotal) * 100) / 100
    const monthPct = monthlyTarget > 0 ? Math.round((monthTotalSales / monthlyTarget) * 100) : 0

    return NextResponse.json({
      dailyTarget,
      monthlyTarget,
      dailySales,
      dailyPct,
      dailyAchieved,
      dailyRemaining,
      applyDailyAllMonth,
      monthTotalSales,
      monthPct,
      todayStr,
      yearMonth,
    })
  } catch (error) {
    console.error('[MyDailyTarget GET]', error)
    return NextResponse.json({ error: 'Error al obtener meta diaria' }, { status: 500 })
  }
}
