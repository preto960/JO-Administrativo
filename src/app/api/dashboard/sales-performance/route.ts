import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'

// GET /api/dashboard/sales-performance?month=2025-06
// Returns per-vendor sales totals (products + renewals) + their targets for the selected month
export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if ('status' in auth) return auth

  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month') || '' // "2025-06"

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'month es requerido (formato: 2025-06)' }, { status: 400 })
  }

  try {
    // Parse month boundaries in Colombia timezone
    const [year, mon] = month.split('-').map(Number)
    const startDate = new Date(year, mon - 1, 1, 0, 0, 0, 0)
    const endDate = new Date(year, mon, 0, 23, 59, 59, 999) // last day of month

    // Get all active users that could be vendors
    const users = await db.user.findMany({
      where: { active: true, deletedAt: null, role: { in: ['admin', 'gerente', 'cajero', 'vendedor'] } },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    })

    // 1. Sum product sales per user in the month
    const salesByUser = await db.sale.groupBy({
      by: ['userId'],
      where: {
        status: 'completada',
        date: { gte: startDate, lte: endDate },
      },
      _sum: { total: true },
    })

    // 2. Sum renewal cash movements per user in the month
    // Renewals create CashMovement with concept containing "Renovación plan:"
    const renewalsByUser = await db.cashMovement.groupBy({
      by: ['userId'],
      where: {
        type: 'entrada',
        concept: { contains: 'Renovación plan:' },
        createdAt: { gte: startDate, lte: endDate },
      },
      _sum: { amount: true },
    })

    // Build maps
    const salesMap = new Map(salesByUser.map(s => [s.userId, s._sum.total || 0]))
    const renewalsMap = new Map(renewalsByUser.map(r => [r.userId, r._sum.amount || 0]))

    // 3. Get targets for this month
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
        userId: u.id,
        userName: u.name,
        role: u.role,
        productSales,
        renewalSales,
        totalSales,
        target,
        achieved,
        remaining,
        percent,
        overTarget,
      }
    })

    // Sort by total sales descending
    performance.sort((a, b) => b.totalSales - a.totalSales)

    // Totals
    const totalMonthSales = Math.round(performance.reduce((s, p) => s + p.totalSales, 0) * 100) / 100
    const totalMonthTarget = Math.round(performance.reduce((s, p) => s + p.target, 0) * 100) / 100

    return NextResponse.json({
      month,
      performance,
      totalMonthSales,
      totalMonthTarget,
    })
  } catch (error) {
    console.error('[SalesPerformance GET]', error)
    return NextResponse.json({ error: 'Error al obtener rendimiento' }, { status: 500 })
  }
}