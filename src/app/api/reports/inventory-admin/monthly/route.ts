import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { getPermissions } from '@/lib/permissions'

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

    if (!branchId) {
      return NextResponse.json({ error: 'branchId es requerido' }, { status: 400 })
    }

    // Parse year and month
    const [yearStr, monthStr] = yearMonth.split('-')
    const year = parseInt(yearStr, 10)
    const month = parseInt(monthStr, 10)

    // Date range for the month
    const startDate = new Date(year, month - 1, 1)
    const endDate = new Date(year, month, 0, 23, 59, 59, 999)

    // Get all products with inventory in this branch
    const inventoryItems = await db.inventory.findMany({
      where: { branchId },
      include: {
        product: {
          select: { id: true, name: true, active: true, sku: true, currency: { select: { symbol: true, code: true } } },
        },
      },
    })

    const activeInventory = inventoryItems.filter(inv => inv.product.active)

    // Get sales for this month in this branch (aggregate by productId)
    const salesData = await db.saleLine.findMany({
      where: {
        sale: {
          branchId,
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

    // Get inventory adjustments for this month in this branch
    const adjustments = await db.inventoryAdjustment.findMany({
      where: {
        branchId,
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

    // Build report data
    const report = activeInventory.map(inv => {
      const productId = inv.productId
      const salesQty = Math.round((salesByProduct.get(productId) || 0) * 100) / 100
      const perdidasQty = Math.round((perdidasByProduct.get(productId) || 0) * 100) / 100
      const obsequiosQty = Math.round((obsequiosByProduct.get(productId) || 0) * 100) / 100

      return {
        productId,
        productName: inv.product.name,
        sku: inv.product.sku || null,
        currentStock: inv.stock,
        salesQty,
        perdidasQty,
        obsequiosQty,
        currencySymbol: inv.product.currency.symbol,
      }
    })

    // Totals
    const totals = {
      salesQty: Math.round(report.reduce((s, r) => s + r.salesQty, 0) * 100) / 100,
      perdidasQty: Math.round(report.reduce((s, r) => s + r.perdidasQty, 0) * 100) / 100,
      obsequiosQty: Math.round(report.reduce((s, r) => s + r.obsequiosQty, 0) * 100) / 100,
      currentStock: Math.round(report.reduce((s, r) => s + r.currentStock, 0) * 100) / 100,
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
