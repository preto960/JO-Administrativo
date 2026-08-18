import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { getPermissions } from '@/lib/permissions'
import { fetchAppTz } from '@/lib/tz-helpers'

// GET /api/reports/inventory-admin/monthly — Monthly inventory report for admin
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if ('status' in auth) return auth

    const perms = getPermissions(auth.role)
    if (auth.role !== 'admin' && auth.role !== 'gerente' && !perms.canManageProducts) {
      return NextResponse.json({ error: 'Sin permisos para ver reportes de inventario' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const yearMonth = searchParams.get('yearMonth')
    const branchId = searchParams.get('branchId')

    if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) {
      return NextResponse.json({ error: 'yearMonth es requerido (formato: "2025-07")' }, { status: 400 })
    }

    // Parse year and month
    const [year, mon] = yearMonth.split('-').map(Number)

    // Build timezone-aware date range for the month
    const appTz = await fetchAppTz()
    const firstDayStr = `${year}-${String(mon).padStart(2, '0')}-01`
    const refDate = new Date(firstDayStr + 'T12:00:00')
    const localDate = new Date(refDate.toLocaleString('en-US', { timeZone: appTz.timezone }))
    const offsetMs = localDate.getTime() - refDate.getTime()
    const offsetHours = offsetMs / 3600000

    const startDate = new Date(Date.UTC(year, mon - 1, 1, -offsetHours, 0, 0, 0))
    const endDate = new Date(Date.UTC(year, mon, 0, 24 - offsetHours, 59, 59, 999))

    // Build branch filter — null means all branches
    const branchFilter: Record<string, unknown> = branchId ? { branchId } : {}

    // Get all products with inventory in this branch (or all branches)
    const inventoryItems = await db.inventory.findMany({
      where: branchFilter,
      include: {
        product: {
          select: { id: true, name: true, active: true, sku: true, costAvg: true, currency: { select: { symbol: true, code: true } } },
        },
      },
    })

    const activeInventory = inventoryItems.filter(inv => inv.product.active)

    // Get sales for this month (aggregate by productId)
    const salesData = await db.saleLine.findMany({
      where: {
        sale: {
          ...(branchId ? { branchId } : {}),
          date: { gte: startDate, lte: endDate },
          status: 'completada',
        },
      },
      select: {
        productId: true,
        quantity: true,
      },
    })

    // Aggregate sales by product
    const salesByProduct = new Map<string, number>()
    for (const line of salesData) {
      salesByProduct.set(line.productId, (salesByProduct.get(line.productId) || 0) + line.quantity)
    }

    // Get inventory adjustments for this month
    const adjustments = await db.inventoryAdjustment.findMany({
      where: {
        ...(branchId ? { branchId } : {}),
        createdAt: { gte: startDate, lte: endDate },
        type: { in: ['perdida', 'obsequio'] },
      },
      select: {
        productId: true,
        type: true,
        quantity: true,
      },
    })

    // Aggregate adjustments by product and type
    const perdidasByProduct = new Map<string, number>()
    const obsequiosByProduct = new Map<string, number>()
    for (const adj of adjustments) {
      if (adj.type === 'perdida') {
        perdidasByProduct.set(adj.productId, (perdidasByProduct.get(adj.productId) || 0) + adj.quantity)
      } else if (adj.type === 'obsequio') {
        obsequiosByProduct.set(adj.productId, (obsequiosByProduct.get(adj.productId) || 0) + adj.quantity)
      }
    }

    // ── Descuadres from inventory checks (apertura/cierre, verificados) ──
    const descuadreItems = await db.inventoryCheckItem.findMany({
      where: {
        check: {
          status: 'verificado',
          inventoryType: { in: ['apertura', 'cierre'] },
          checkDate: { gte: startDate, lte: endDate },
          ...(branchId ? { branchId } : {}),
        },
      },
      select: {
        productId: true,
        discrepancyQty: true,
      },
    })

    // Aggregate descuadre by product
    const descuadreByProduct = new Map<string, number>()
    for (const item of descuadreItems) {
      descuadreByProduct.set(item.productId, (descuadreByProduct.get(item.productId) || 0) + item.discrepancyQty)
    }

    // Build report data
    const report = activeInventory.map(inv => {
      const productId = inv.productId
      const salesQty = Math.round((salesByProduct.get(productId) || 0) * 100) / 100
      const perdidasQty = Math.round((perdidasByProduct.get(productId) || 0) * 100) / 100
      const obsequiosQty = Math.round((obsequiosByProduct.get(productId) || 0) * 100) / 100
      const descuadreQty = Math.round((descuadreByProduct.get(productId) || 0) * 100) / 100

      return {
        productId,
        productName: inv.product.name,
        sku: inv.product.sku || null,
        salePrice: inv.price,
        purchasePrice: inv.product.costAvg,
        currentStock: inv.stock,
        salesQty,
        perdidasQty,
        obsequiosQty,
        descuadreQty,
        currencySymbol: inv.product.currency.symbol,
      }
    })

    // Totals
    const totals = {
      salesQty: Math.round(report.reduce((s, r) => s + r.salesQty, 0) * 100) / 100,
      perdidasQty: Math.round(report.reduce((s, r) => s + r.perdidasQty, 0) * 100) / 100,
      obsequiosQty: Math.round(report.reduce((s, r) => s + r.obsequiosQty, 0) * 100) / 100,
      currentStock: Math.round(report.reduce((s, r) => s + r.currentStock, 0) * 100) / 100,
      descuadreQty: Math.round(report.reduce((s, r) => s + r.descuadreQty, 0) * 100) / 100,
    }

    return NextResponse.json({
      yearMonth,
      branchId,
      startDate,
      endDate,
      products: report,
      totals,
    })
  } catch (error) {
    console.error('[GET inventory-admin/monthly]', error)
    return NextResponse.json({ error: 'Error al generar reporte mensual de inventario' }, { status: 500 })
  }
}
