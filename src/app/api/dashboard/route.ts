import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)

    // Sales today
    const salesToday = await db.sale.findMany({
      where: { date: { gte: today }, status: 'completada' },
      include: { lines: true, payments: true },
    })

    // Sales this month
    const salesMonth = await db.sale.findMany({
      where: { date: { gte: monthStart }, status: 'completada' },
      include: { lines: true, payments: true },
    })

    // Expenses today & month
    const expensesToday = await db.expense.findMany({ where: { date: { gte: today } } })
    const expensesMonth = await db.expense.findMany({ where: { date: { gte: monthStart } } })

    // Adjustments this month (losses)
    const adjustmentsMonth = await db.inventoryAdjustment.findMany({
      where: {
        createdAt: { gte: monthStart },
      },
      include: { product: true },
    })

    // Calculate KPIs
    const ingresosHoy = salesToday.reduce((s, sale) => s + sale.total, 0)
    const ingresosMes = salesMonth.reduce((s, sale) => s + sale.total, 0)
    const gastosHoy = expensesToday.reduce((s, e) => s + e.amount, 0)
    const gastosMes = expensesMonth.reduce((s, e) => s + e.amount, 0)

    const costoVentasHoy = salesToday.reduce((s, sale) =>
      s + sale.lines.reduce((ls, l) => ls + (l.unitCost * l.quantity), 0), 0)
    const costoVentasMes = salesMonth.reduce((s, sale) =>
      s + sale.lines.reduce((ls, l) => ls + (l.unitCost * l.quantity), 0), 0)

    const utilidadBrutaMes = ingresosMes - costoVentasMes
    const perdidasMes = adjustmentsMonth.reduce((s, a) => {
      const prod = a.product
      return s + (a.quantity * (prod?.costAvg || 0))
    }, 0)
    const utilidadNetaMes = utilidadBrutaMes - gastosMes - perdidasMes

    // Top 5 products by revenue
    const productRevenue: Record<string, { name: string; revenue: number; qty: number }> = {}
    salesMonth.forEach(sale => {
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

    // Last 10 sales
    const recentSales = await db.sale.findMany({
      where: { status: 'completada' },
      include: {
        client: { select: { name: true } },
        user: { select: { name: true } },
        lines: { include: { product: { select: { name: true } } } },
      },
      orderBy: { date: 'desc' },
      take: 10,
    })

    // Alerts: low stock
    const lowStockItems = await db.inventory.findMany({
      where: { branchId: 'sucursal-1' },
      include: { product: { select: { name: true, active: true } } },
    })
    const lowStockAlerts = lowStockItems
      .filter(i => i.product.active && i.stock <= i.minStock)
      .map(i => ({ productName: i.product.name, stock: i.stock, minStock: i.minStock }))

    // Alerts: overdue accounts receivable
    const overdueReceivables = await db.accountReceivable.findMany({
      where: { status: 'pendiente', dueDate: { lt: new Date() } },
      include: { client: { select: { name: true } } },
    })
    const overdueAlerts = overdueReceivables.map(r => ({
      clientName: r.client.name,
      pendingBalance: r.pendingBalance,
      dueDate: r.dueDate,
    }))

    // Sales chart data (last 7 days)
    const chartData: { date: string; total: number; count: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      d.setHours(0, 0, 0, 0)
      const nextD = new Date(d)
      nextD.setDate(nextD.getDate() + 1)

      const daySales = await db.sale.findMany({
        where: { date: { gte: d, lt: nextD }, status: 'completada' },
      })
      const dayTotal = daySales.reduce((s, sale) => s + sale.total, 0)

      chartData.push({
        date: d.toLocaleDateString('es-VE', { weekday: 'short', day: 'numeric' }),
        total: Math.round(dayTotal * 100) / 100,
        count: daySales.length,
      })
    }

    // Open cash register
    const openRegister = await db.cashRegister.findFirst({
      where: { status: 'abierta' },
      include: {
        user: { select: { name: true } },
        _count: { select: { sales: true } },
      },
    })

    return NextResponse.json({
      ingresosHoy: Math.round(ingresosHoy * 100) / 100,
      ingresosMes: Math.round(ingresosMes * 100) / 100,
      gastosHoy: Math.round(gastosHoy * 100) / 100,
      gastosMes: Math.round(gastosMes * 100) / 100,
      utilidadBrutaMes: Math.round(utilidadBrutaMes * 100) / 100,
      utilidadNetaMes: Math.round(utilidadNetaMes * 100) / 100,
      topProducts,
      recentSales,
      lowStockAlerts,
      overdueAlerts,
      chartData,
      openRegister,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener dashboard' }, { status: 500 })
  }
}
