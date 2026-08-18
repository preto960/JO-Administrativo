import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'

// GET /api/reports/financial/subscription-revenue — ingresos por suscripciones
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

    // Obtener membresías con pago en el rango de fechas (renovaciones/altas)
    const memberships = await db.clientMembership.findMany({
      where: {
        paymentDate: { gte: startDate, lte: endDate },
        status: 'Activo',
      },
      include: {
        client: {
          select: { id: true, name: true, lastName: true },
        },
        plan: {
          select: { id: true, name: true, planType: true, cost: true },
        },
      },
      orderBy: { paymentDate: 'desc' },
    })

    // Obtener las ventas relacionadas buscando por fecha y clientId
    const clientIds = memberships.map(m => m.clientId)
    const sales = clientIds.length > 0 ? await db.sale.findMany({
      where: {
        clientId: { in: clientIds },
        date: { gte: startDate, lte: endDate },
        status: 'completada',
      },
      include: {
        user: { select: { id: true, name: true } },
      },
    }) : []

    // Mapa de ventas por clientId para obtener monto
    const salesByClient = new Map<string, number>()
    for (const s of sales) {
      const prev = salesByClient.get(s.clientId) || 0
      salesByClient.set(s.clientId, prev + s.total)
    }

    // Agrupar por plan
    const planMap = new Map<string, {
      planId: string
      planName: string
      planType: string
      planCost: number
      totalQty: number
      totalRevenue: number
    }>()

    for (const m of memberships) {
      if (!m.plan) continue
      const key = m.plan.id
      const revenue = salesByClient.get(m.clientId) || m.plan.cost
      const existing = planMap.get(key) || {
        planId: m.plan.id,
        planName: m.plan.name,
        planType: m.plan.planType,
        planCost: m.plan.cost,
        totalQty: 0,
        totalRevenue: 0,
      }
      existing.totalQty += 1
      existing.totalRevenue += revenue
      planMap.set(key, existing)
    }

    // Construir resultado ordenado por cantidad descendente
    const plans = Array.from(planMap.values())
      .map(p => ({
        ...p,
        totalRevenue: Math.round(p.totalRevenue * 100) / 100,
        avgRevenue: p.totalQty > 0 ? Math.round((p.totalRevenue / p.totalQty) * 100) / 100 : 0,
      }))
      .sort((a, b) => b.totalQty - a.totalQty)

    // Totales
    const totalRevenue = plans.reduce((sum, p) => sum + p.totalRevenue, 0)
    const totalQty = plans.reduce((sum, p) => sum + p.totalQty, 0)

    // Detalle de renovaciones
    const details = memberships.map(m => {
      const sale = sales.find(s => s.clientId === m.clientId)
      return {
        id: m.id,
        date: m.paymentDate?.toISOString() || '',
        clientName: `${m.client.name}${m.client.lastName ? ' ' + m.client.lastName : ''}`,
        planName: m.plan?.name || '—',
        planType: m.plan?.planType || '—',
        revenue: salesByClient.get(m.clientId) || m.plan?.cost || 0,
        userName: sale?.user?.name || '—',
      }
    })

    return NextResponse.json({
      plans,
      summary: {
        totalQty,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        topPlan: plans[0]?.planName || null,
        topPlanQty: plans[0]?.totalQty || 0,
      },
      details,
    })
  } catch (error) {
    console.error('[Subscription Revenue GET]', error)
    return NextResponse.json({ error: 'Error al generar reporte de suscripciones' }, { status: 500 })
  }
}
