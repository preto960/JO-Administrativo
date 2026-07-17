import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { fetchAppTz } from '@/lib/tz-helpers'

// GET /api/dashboard/sales-performance?month=2025-06&period=today|week|month|custom&from=2025-06-15&to=2025-06-20
// Returns per-vendor sales totals + their targets for the selected month/period
// Filters (period) are scoped within the selected month — you cannot see data from other months

type PerfPeriod = 'today' | 'week' | 'month' | 'custom'

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if ('status' in auth) return auth

  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month') || ''
  const period: PerfPeriod = (searchParams.get('period') as PerfPeriod) || 'month'
  const customFrom = searchParams.get('from') || ''
  const customTo = searchParams.get('to') || ''

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'month es requerido (formato: 2025-06)' }, { status: 400 })
  }

  try {
    const [year, mon] = month.split('-').map(Number)
    const appTz = await fetchAppTz()

    // ── Build month boundaries (for clamping filters) ──
    const firstDayStr = `${year}-${String(mon).padStart(2, '0')}-01`
    const monthStartDate = new Date(firstDayStr + 'T00:00:00')
    const lastDayDate = new Date(Date.UTC(year, mon, 0))
    const lastDayStr = lastDayDate.toLocaleDateString('en-CA', { timeZone: appTz.timezone })
    const monthEndDate = new Date(lastDayStr + 'T23:59:59.999')

    // ── Build period date range (clamped within the month) ──
    let periodStart: Date
    let periodEnd: Date
    let periodLabel: string

    // Helper to get "today" in app timezone
    const getTodayStr = () => new Date().toLocaleDateString('en-CA', { timeZone: appTz.timezone })

    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

    if (period === 'today') {
      const todayStr = getTodayStr()
      periodStart = new Date(todayStr + 'T00:00:00')
      periodEnd = new Date(todayStr + 'T23:59:59.999')
      periodLabel = 'Hoy'
    } else if (period === 'week') {
      // Current week (Mon-Sun) within the month
      const now = new Date()
      const localStr = now.toLocaleString('en-US', { timeZone: appTz.timezone })
      const localNow = new Date(localStr)
      const dayOfWeek = localNow.getDay() // 0=Sun, 1=Mon...
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
      const monday = new Date(localNow)
      monday.setDate(localNow.getDate() + mondayOffset)
      const sunday = new Date(monday)
      sunday.setDate(monday.getDate() + 6)

      const mondayStr = monday.toLocaleDateString('en-CA', { timeZone: appTz.timezone })
      const sundayStr = sunday.toLocaleDateString('en-CA', { timeZone: appTz.timezone })

      periodStart = new Date(mondayStr + 'T00:00:00')
      periodEnd = new Date(sundayStr + 'T23:59:59.999')
      periodLabel = 'Semana'
    } else if (period === 'custom' && customFrom && customTo) {
      periodStart = new Date(customFrom + 'T00:00:00')
      periodEnd = new Date(customTo + 'T23:59:59.999')
      periodLabel = `${customFrom} – ${customTo}`
    } else {
      // "month" — full month
      periodStart = monthStartDate
      periodEnd = monthEndDate
      periodLabel = `${monthNames[mon - 1]} ${year}`
    }

    // ── Clamp dates within the selected month ──
    if (periodStart < monthStartDate) periodStart = monthStartDate
    if (periodEnd > monthEndDate) periodEnd = monthEndDate

    // ── Adjust to UTC using timezone offset ──
    const refDate = new Date(firstDayStr + 'T12:00:00')
    const localDate = new Date(refDate.toLocaleString('en-US', { timeZone: appTz.timezone }))
    const offsetMs = localDate.getTime() - refDate.getTime()
    const offsetHours = offsetMs / 3600000

    const startDate = new Date(Date.UTC(
      periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate(),
      -offsetHours, 0, 0, 0
    ))
    const endDate = new Date(Date.UTC(
      periodEnd.getFullYear(), periodEnd.getMonth(), periodEnd.getDate(),
      24 - offsetHours, 59, 59, 999
    ))

    // Also compute month-wide boundaries for the full month target comparison
    const fullMonthStartDate = new Date(Date.UTC(year, mon - 1, 1, -offsetHours, 0, 0, 0))
    const fullMonthEndDate = new Date(Date.UTC(year, mon, 0, 24 - offsetHours, 59, 59, 999))

    const users = await db.user.findMany({
      where: { active: true, deletedAt: null, role: { in: ['admin', 'gerente', 'cajero', 'vendedor'] } },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    })

    // Get credit sale IDs to exclude from calculations
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

    // 3. Sum collected credit payments in this period, attributed to the credit CREATOR
    const collectedPayments = await db.clientPayment.findMany({
      where: { createdAt: { gte: startDate, lte: endDate } },
      select: {
        amount: true,
        receivable: { select: { createdById: true } },
      },
    })
    const collectedByCreator = new Map<string, number>()
    for (const p of collectedPayments) {
      const creatorId = p.receivable?.createdById
      if (!creatorId) continue
      collectedByCreator.set(creatorId, Math.round(((collectedByCreator.get(creatorId) || 0) + p.amount) * 100) / 100)
    }

    // 4. Get targets (for the full month — the meta mensual doesn't change with period filter)
    const targets = await db.salesTarget.findMany({
      where: { yearMonth: month },
      select: { userId: true, targetAmount: true, dailyTargetAmount: true, applyDailyAllMonth: true },
    })
    const targetMap = new Map(targets.map(t => [t.userId, t]))

    // 5. Also get month-wide sales for monthly target comparison
    const monthCreditSaleIds = (await db.accountReceivable.findMany({
      where: { sale: { date: { gte: fullMonthStartDate, lte: fullMonthEndDate } } },
      select: { saleId: true },
    })).map(r => r.saleId)

    const monthSalesByUser = await db.sale.groupBy({
      by: ['userId'],
      where: {
        status: 'completada',
        date: { gte: fullMonthStartDate, lte: fullMonthEndDate },
        ...(monthCreditSaleIds.length > 0 ? { id: { notIn: monthCreditSaleIds } } : {}),
        lines: { some: {} },
      },
      _sum: { total: true },
    })

    const monthRenewalsByUser = await db.sale.groupBy({
      by: ['userId'],
      where: {
        status: 'completada',
        date: { gte: fullMonthStartDate, lte: fullMonthEndDate },
        lines: { none: {} },
        ...(monthCreditSaleIds.length > 0 ? { id: { notIn: monthCreditSaleIds } } : {}),
      },
      _sum: { total: true },
    })

    const monthSalesMap = new Map(monthSalesByUser.map(s => [s.userId, s._sum.total || 0]))
    const monthRenewalsMap = new Map(monthRenewalsByUser.map(r => [r.userId, r._sum.total || 0]))

    const monthCollectedPayments = await db.clientPayment.findMany({
      where: { createdAt: { gte: fullMonthStartDate, lte: fullMonthEndDate } },
      select: {
        amount: true,
        receivable: { select: { createdById: true } },
      },
    })
    const monthCollectedByCreator = new Map<string, number>()
    for (const p of monthCollectedPayments) {
      const creatorId = p.receivable?.createdById
      if (!creatorId) continue
      monthCollectedByCreator.set(creatorId, Math.round(((monthCollectedByCreator.get(creatorId) || 0) + p.amount) * 100) / 100)
    }

    // 6. Build result — also include inactive users if they have collected credits
    const activeUserIds = new Set(users.map(u => u.id))
    const extraCreatorIds = [...collectedByCreator.keys(), ...monthCollectedByCreator.keys()]
      .filter(id => !activeUserIds.has(id))
    const uniqueExtraIds = [...new Set(extraCreatorIds)]
    let allUsers = users
    if (uniqueExtraIds.length > 0) {
      const extraUsers = await db.user.findMany({
        where: { id: { in: uniqueExtraIds } },
        select: { id: true, name: true, role: true },
      })
      allUsers = [...users, ...extraUsers]
    }

    // Calculate today's date for daily target logic
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: appTz.timezone })

    const performance = allUsers.map(u => {
      // Period sales
      const productSales = salesMap.get(u.id) || 0
      const renewalSales = renewalsMap.get(u.id) || 0
      const collectedCredit = collectedByCreator.get(u.id) || 0
      const totalSales = Math.round((productSales + renewalSales + collectedCredit) * 100) / 100

      // Month sales (for monthly target)
      const monthProductSales = monthSalesMap.get(u.id) || 0
      const monthRenewalSales = monthRenewalsMap.get(u.id) || 0
      const monthCollectedCredit = monthCollectedByCreator.get(u.id) || 0
      const monthTotalSales = Math.round((monthProductSales + monthRenewalSales + monthCollectedCredit) * 100) / 100

      // Target info
      const targetInfo = targetMap.get(u.id)
      const target = targetInfo?.targetAmount || 0
      const dailyTarget = targetInfo?.dailyTargetAmount || 0
      const applyDailyAllMonth = targetInfo?.applyDailyAllMonth || false

      // Monthly target progress
      const achieved = target > 0 && monthTotalSales >= target
      const remaining = target > 0 ? Math.max(0, Math.round((target - monthTotalSales) * 100) / 100) : 0
      const percent = target > 0 ? Math.round((monthTotalSales / target) * 100) : 0
      const overTarget = target > 0 ? Math.max(0, Math.round((monthTotalSales - target) * 100) / 100) : 0

      // Daily target progress (period = today for daily comparison)
      // For "today" period, compare against daily target
      // For other periods, daily target info is returned but not the main comparison
      const todayStart = new Date(todayStr + 'T00:00:00')
      const todayEnd = new Date(todayStr + 'T23:59:59.999')
      const todayUtcStart = new Date(Date.UTC(todayStart.getFullYear(), todayStart.getMonth(), todayStart.getDate(), -offsetHours, 0, 0, 0))
      const todayUtcEnd = new Date(Date.UTC(todayEnd.getFullYear(), todayEnd.getMonth(), todayEnd.getDate(), 24 - offsetHours, 59, 59, 999))

      let dailySales = 0
      let dailyProductSales = 0
      let dailyRenewalSales = 0
      let dailyCollectedCredit = 0

      return {
        userId: u.id, userName: u.name, role: u.role,
        productSales, renewalSales, totalSales, // period-filtered
        monthProductSales, monthRenewalSales, monthTotalSales, // full month
        target, dailyTarget, applyDailyAllMonth,
        achieved, remaining, percent, overTarget,
        dailySales, dailyProductSales, dailyRenewalSales, dailyCollectedCredit,
      }
    })

    // Fill daily sales for today (async but we need it)
    // Calculate today's sales per user
    const todayStart = new Date(todayStr + 'T00:00:00')
    const todayEnd = new Date(todayStr + 'T23:59:59.999')
    const todayUtcStart = new Date(Date.UTC(todayStart.getFullYear(), todayStart.getMonth(), todayStart.getDate(), -offsetHours, 0, 0, 0))
    const todayUtcEnd = new Date(Date.UTC(todayEnd.getFullYear(), todayEnd.getMonth(), todayEnd.getDate(), 24 - offsetHours, 59, 59, 999))

    const todayCreditSaleIds = (await db.accountReceivable.findMany({
      where: { sale: { date: { gte: todayUtcStart, lte: todayUtcEnd } } },
      select: { saleId: true },
    })).map(r => r.saleId)

    const todaySalesByUser = await db.sale.groupBy({
      by: ['userId'],
      where: {
        status: 'completada',
        date: { gte: todayUtcStart, lte: todayUtcEnd },
        ...(todayCreditSaleIds.length > 0 ? { id: { notIn: todayCreditSaleIds } } : {}),
        lines: { some: {} },
      },
      _sum: { total: true },
    })

    const todayRenewalsByUser = await db.sale.groupBy({
      by: ['userId'],
      where: {
        status: 'completada',
        date: { gte: todayUtcStart, lte: todayUtcEnd },
        lines: { none: {} },
        ...(todayCreditSaleIds.length > 0 ? { id: { notIn: todayCreditSaleIds } } : {}),
      },
      _sum: { total: true },
    })

    const todaySalesMap = new Map(todaySalesByUser.map(s => [s.userId, s._sum.total || 0]))
    const todayRenewalsMap = new Map(todayRenewalsByUser.map(r => [r.userId, r._sum.total || 0]))

    const todayCollectedPayments = await db.clientPayment.findMany({
      where: { createdAt: { gte: todayUtcStart, lte: todayUtcEnd } },
      select: {
        amount: true,
        receivable: { select: { createdById: true } },
      },
    })
    const todayCollectedByCreator = new Map<string, number>()
    for (const p of todayCollectedPayments) {
      const creatorId = p.receivable?.createdById
      if (!creatorId) continue
      todayCollectedByCreator.set(creatorId, Math.round(((todayCollectedByCreator.get(creatorId) || 0) + p.amount) * 100) / 100)
    }

    // Fill daily sales into performance
    for (const p of performance) {
      p.dailyProductSales = todaySalesMap.get(p.userId) || 0
      p.dailyRenewalSales = todayRenewalsMap.get(p.userId) || 0
      p.dailyCollectedCredit = todayCollectedByCreator.get(p.userId) || 0
      p.dailySales = Math.round((p.dailyProductSales + p.dailyRenewalSales + p.dailyCollectedCredit) * 100) / 100
    }

    performance.sort((a, b) => b.totalSales - a.totalSales)

    const totalMonthSales = Math.round(performance.reduce((s, p) => s + p.monthTotalSales, 0) * 100) / 100
    const totalMonthTarget = Math.round(performance.reduce((s, p) => s + p.target, 0) * 100) / 100
    const totalPeriodSales = Math.round(performance.reduce((s, p) => s + p.totalSales, 0) * 100) / 100

    return NextResponse.json({
      month, period, periodLabel,
      performance, totalMonthSales, totalMonthTarget, totalPeriodSales,
    })
  } catch (error) {
    console.error('[SalesPerformance GET]', error)
    return NextResponse.json({ error: 'Error al obtener rendimiento' }, { status: 500 })
  }
}
