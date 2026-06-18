import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { resolveBranchId } from '@/lib/resolve-branch'

/** Filter out credit sales — sales that have an AccountReceivable are credit and not collected yet */
function filterNonCredit(sales: Array<{ total: number; receivables: Array<{ id: string }> }>) {
  return sales.filter(s => s.receivables.length === 0)
}

export async function GET(request: NextRequest) {
  try {
    const branchId = await resolveBranchId(request)
    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') || 'month'

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    let startDate: Date
    let chartDays: number
    let chartLabel: string

    switch (period) {
      case 'today':
        startDate = new Date(today)
        chartDays = 1
        chartLabel = 'Hoy'
        break
      case 'week':
        startDate = new Date(today)
        startDate.setDate(startDate.getDate() - 7)
        chartDays = 7
        chartLabel = '7 días'
        break
      case 'year':
        startDate = new Date(today.getFullYear(), 0, 1)
        chartDays = 12
        chartLabel = '12 meses'
        break
      case 'month':
      default:
        startDate = new Date(today.getFullYear(), today.getMonth(), 1)
        chartDays = 7
        chartLabel = '7 días'
        break
    }

    const customFrom = searchParams.get('from')
    const customTo = searchParams.get('to')
    let endDate = new Date()
    endDate.setHours(23, 59, 59, 999)
    let isCustom = false
    if (customFrom) {
      startDate = new Date(customFrom)
      startDate.setHours(0, 0, 0, 0)
      isCustom = true
    }
    if (customTo) {
      endDate = new Date(customTo)
      endDate.setHours(23, 59, 59, 999)
      isCustom = true
    }
    if (isCustom) {
      const fmt = (d: Date) => d.toLocaleDateString('es-VE', { day: 'numeric', month: 'short' })
      chartLabel = `${fmt(startDate)} – ${fmt(endDate)}`
      chartDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
      chartDays = Math.min(chartDays, 365)
    }

    // ─── Sales queries (include receivables to detect credit) ───
    const salesPeriod = await db.sale.findMany({
      where: { date: { gte: startDate, lte: endDate }, status: 'completada', branchId },
      include: {
        lines: { include: { product: { select: { name: true } } } },
        payments: true,
        receivables: { select: { id: true } },
      },
    })

    const salesToday = await db.sale.findMany({
      where: { date: { gte: today }, status: 'completada', branchId },
      include: { receivables: { select: { id: true } } },
    })
    const expensesToday = await db.expense.findMany({ where: { date: { gte: today }, branchId, deletedAt: null } })

    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    const salesMonth = await db.sale.findMany({
      where: { date: { gte: monthStart }, status: 'completada', branchId },
      include: {
        lines: { include: { product: { select: { name: true } } } },
        receivables: { select: { id: true } },
      },
    })
    const expensesMonth = await db.expense.findMany({ where: { date: { gte: monthStart }, branchId, deletedAt: null } })

    // ─── Renewal income from subscription Sales (no lines), excluding credit ───
    const branchRegIds = (await db.cashRegister.findMany({ where: { branchId }, select: { id: true } })).map(r => r.id)
    const subSalesToday = await db.sale.findMany({
      where: {
        cashRegId: { in: branchRegIds },
        date: { gte: today },
        status: 'completada',
        lines: { none: {} },
      },
      include: { receivables: { select: { id: true } } },
    })
    const subSalesMonth = await db.sale.findMany({
      where: {
        cashRegId: { in: branchRegIds },
        date: { gte: monthStart },
        status: 'completada',
        lines: { none: {} },
      },
      include: { receivables: { select: { id: true } } },
    })
    const renewalHoy = filterNonCredit(subSalesToday).reduce((s, sale) => s + sale.total, 0)
    const renewalMes = filterNonCredit(subSalesMonth).reduce((s, sale) => s + sale.total, 0)

    // ─── Expenses & Adjustments in period ───
    const expensesPeriod = await db.expense.findMany({ where: { date: { gte: startDate, lte: endDate }, branchId, deletedAt: null } })
    const adjustmentsPeriod = await db.inventoryAdjustment.findMany({
      where: { createdAt: { gte: startDate }, branchId },
      include: { product: true },
    })

    // ─── KPIs (exclude credit sales from income) ───
    const nonCreditToday = filterNonCredit(salesToday)
    const nonCreditMonth = filterNonCredit(salesMonth)
    const nonCreditPeriod = filterNonCredit(salesPeriod)

    const ingresosHoy = Math.round((nonCreditToday.reduce((s, sale) => s + sale.total, 0) + renewalHoy) * 100) / 100
    const gastosHoy = Math.round(expensesToday.reduce((s, e) => s + e.amount, 0) * 100) / 100
    const ingresosMes = Math.round((nonCreditMonth.reduce((s, sale) => s + sale.total, 0) + renewalMes) * 100) / 100
    const gastosMes = Math.round(expensesMonth.reduce((s, e) => s + e.amount, 0) * 100) / 100

    // ─── Utility calculations (month) ───
    // Only count cost from non-credit sales (credit hasn't been collected)
    const costoVentasMes = nonCreditMonth.reduce((s, sale) =>
      s + (sale as typeof sale & { lines: Array<{ unitCost: number; quantity: number }> }).lines.reduce((ls, l) => ls + (l.unitCost * l.quantity), 0), 0)
    const utilidadBrutaMes = Math.round((ingresosMes - costoVentasMes) * 100) / 100
    const perdidasMes = adjustmentsPeriod.reduce((s, a) => s + (a.quantity * (a.product?.costAvg || 0)), 0)
    const utilidadNetaMes = Math.round((utilidadBrutaMes - gastosMes - perdidasMes) * 100) / 100

    // ─── Period totals ───
    const ingresosPeriodo = Math.round(nonCreditPeriod.reduce((s, sale) => s + sale.total, 0) * 100) / 100
    const gastosPeriodo = Math.round(expensesPeriod.reduce((s, e) => s + e.amount, 0) * 100) / 100

    const costoVentasPeriodo = nonCreditPeriod.reduce((s, sale) =>
      s + sale.lines.reduce((ls, l) => ls + (l.unitCost * l.quantity), 0), 0)
    const utilidadBrutaPeriodo = Math.round((ingresosPeriodo - costoVentasPeriodo) * 100) / 100
    const perdidasPeriodo = adjustmentsPeriod.reduce((s, a) => s + (a.quantity * (a.product?.costAvg || 0)), 0)
    const utilidadNetaPeriodo = Math.round((utilidadBrutaPeriodo - gastosPeriodo - perdidasPeriodo) * 100) / 100

    // ─── Top 5 products by revenue (non-credit POS sales only) ───
    const productRevenue: Record<string, { name: string; revenue: number; qty: number }> = {}
    nonCreditPeriod.forEach(sale => {
      sale.lines.forEach(line => {
        const key = line.productId
        if (!productRevenue[key]) {
          productRevenue[key] = { name: line.product?.name || 'Producto', revenue: 0, qty: 0 }
        }
        productRevenue[key].revenue += line.lineTotal
        productRevenue[key].qty += line.quantity
      })
    })
    const topProducts = Object.values(productRevenue)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)

    // ─── Last 10 sales in period (with full name + products) ───
    const recentSales = await db.sale.findMany({
      where: { date: { gte: startDate, lte: endDate }, status: 'completada', branchId },
      include: {
        client: { select: { name: true, lastName: true } },
        user: { select: { name: true } },
        lines: { include: { product: { select: { name: true } } } },
      },
      orderBy: { date: 'desc' },
      take: 10,
    })

    // ─── Active products count ───
    const totalProductosActivos = await db.product.count({ where: { active: true } })

    // ─── Active clients count ───
    const totalClientesActivos = await db.client.count({ where: { deletedAt: null } })

    // ─── Alerts: low stock ───
    const lowStockItems = await db.inventory.findMany({
      where: { branchId },
      include: { product: { select: { name: true, active: true } } },
    })
    const lowStockAlerts = lowStockItems
      .filter(i => i.product.active && i.minStock > 0 && i.stock <= i.minStock)
      .map(i => ({ productName: i.product.name, stock: i.stock, minStock: i.minStock }))

    // ─── Alerts: overdue receivables ───
    const overdueReceivables = await db.accountReceivable.findMany({
      where: { status: 'pendiente', dueDate: { lt: new Date() } },
      include: { client: { select: { name: true, lastName: true } } },
    })
    const overdueAlerts = overdueReceivables.map(r => ({
      clientName: `${r.client.name}${r.client.lastName ? ' ' + r.client.lastName : ''}`,
      pendingBalance: r.pendingBalance,
      dueDate: r.dueDate,
    }))

    // ─── Alerts: overdue payables ───
    const overduePayables = await db.accountPayable.findMany({
      where: { status: 'pendiente', dueDate: { lt: new Date() } },
      include: { supplier: { select: { name: true } } },
    })
    const overduePayableAlerts = overduePayables.map(p => ({
      supplierName: p.supplier?.name || 'Desconocido',
      pendingBalance: p.pendingBalance,
      dueDate: p.dueDate,
    }))

    // ─── Chart data (exclude credit sales) ───
    const chartData: { date: string; total: number; count: number }[] = []

    // Get IDs of credit sales to exclude from chart
    const creditSaleIds = new Set(
      (await db.accountReceivable.findMany({
        where: {
          sale: { date: { gte: isCustom ? startDate : (period === 'year' ? new Date(today.getFullYear(), 0, 1) : period === 'today' ? today : new Date(today.getFullYear(), today.getMonth(), 1)) },
        },
        select: { saleId: true },
      })).map(r => r.saleId)
    )

    if (period === 'year') {
      for (let i = 11; i >= 0; i--) {
        const mStart = new Date(today.getFullYear(), today.getMonth() - i, 1)
        const mEnd = new Date(today.getFullYear(), today.getMonth() - i + 1, 1)
        const monthSales = await db.sale.findMany({
          where: { date: { gte: mStart, lt: mEnd }, status: 'completada', branchId },
        })
        const nonCreditMonthSales = monthSales.filter(s => !creditSaleIds.has(s.id))
        const monthTotal = nonCreditMonthSales.reduce((s, sale) => s + sale.total, 0)
        chartData.push({
          date: mStart.toLocaleDateString('es-VE', { month: 'short' }),
          total: Math.round(monthTotal * 100) / 100,
          count: nonCreditMonthSales.length,
        })
      }
    } else if (period === 'today') {
      for (let h = 0; h < 24; h++) {
        const hStart = new Date(today); hStart.setHours(h, 0, 0, 0)
        const hEnd = new Date(today); hEnd.setHours(h + 1, 0, 0, 0)
        const hourSales = await db.sale.findMany({
          where: { date: { gte: hStart, lt: hEnd }, status: 'completada', branchId },
        })
        const nonCreditHourSales = hourSales.filter(s => !creditSaleIds.has(s.id))
        const hourTotal = nonCreditHourSales.reduce((s, sale) => s + sale.total, 0)
        if (hourTotal > 0 || h <= new Date().getHours()) {
          chartData.push({
            date: `${h}:00`,
            total: Math.round(hourTotal * 100) / 100,
            count: nonCreditHourSales.length,
          })
        }
      }
    } else {
      const rangeStart = isCustom ? new Date(startDate) : new Date()
      if (!isCustom) rangeStart.setDate(rangeStart.getDate() - (chartDays - 1))
      rangeStart.setHours(0, 0, 0, 0)
      const rangeEnd = isCustom ? new Date(endDate) : new Date()
      rangeEnd.setHours(23, 59, 59, 999)
      const totalDays = Math.ceil((rangeEnd.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24)) + 1
      const groupByDays = totalDays > 60 ? 7 : 1
      for (let i = 0; i < totalDays; i += groupByDays) {
        const d = new Date(rangeStart); d.setDate(d.getDate() + i); d.setHours(0, 0, 0, 0)
        const nextD = new Date(d); nextD.setDate(nextD.getDate() + groupByDays)
        if (nextD > rangeEnd) nextD.setTime(rangeEnd.getTime())
        const daySales = await db.sale.findMany({
          where: { date: { gte: d, lt: nextD }, status: 'completada', branchId },
        })
        const nonCreditDaySales = daySales.filter(s => !creditSaleIds.has(s.id))
        const dayTotal = nonCreditDaySales.reduce((s, sale) => s + sale.total, 0)
        chartData.push({
          date: d.toLocaleDateString('es-VE', { weekday: 'short', day: 'numeric', month: 'short' }),
          total: Math.round(dayTotal * 100) / 100,
          count: nonCreditDaySales.length,
        })
      }
    }

    // ─── Open cash register ───
    const openRegister = await db.cashRegister.findFirst({
      where: { status: 'abierta', branchId },
      include: { user: { select: { name: true } }, _count: { select: { sales: true } } },
    })

    return NextResponse.json({
      ingresosHoy, ingresosMes, gastosHoy, gastosMes,
      ingresosPeriodo, gastosPeriodo,
      utilidadBrutaMes, utilidadNetaMes,
      utilidadBrutaPeriodo, utilidadNetaPeriodo,
      topProducts, recentSales,
      totalProductosActivos, totalClientesActivos,
      lowStockAlerts, overdueAlerts, overduePayableAlerts,
      chartData, chartLabel, period, openRegister,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener dashboard' }, { status: 500 })
  }
}