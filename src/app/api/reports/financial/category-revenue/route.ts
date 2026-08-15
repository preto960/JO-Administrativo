import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'

// GET /api/reports/financial/category-revenue — ingresos por categoría
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

    // Obtener líneas de venta con información del producto y su categoría
    const saleLines = await db.saleLine.findMany({
      where: {
        sale: {
          status: 'completada',
          date: { gte: startDate, lte: endDate },
          ...(branchId ? { branchId } : {}),
        },
      },
      include: {
        product: {
          select: {
            name: true,
            costAvg: true,
            category: {
              select: { id: true, name: true },
            },
          },
        },
      },
    })

    // Agrupar por categoría
    const categoryMap = new Map<string, {
      categoryName: string
      totalQty: number
      totalRevenue: number
      totalCost: number
    }>()

    for (const line of saleLines) {
      const catName = line.product.category?.name || 'Sin categoría'
      const catKey = line.product.category?.id || '__none__'

      const existing = categoryMap.get(catKey) || {
        categoryName: catName,
        totalQty: 0,
        totalRevenue: 0,
        totalCost: 0,
      }

      existing.totalQty += line.quantity
      existing.totalRevenue += line.unitPrice * line.quantity
      existing.totalCost += line.unitCost * line.quantity

      categoryMap.set(catKey, existing)
    }

    // Construir resultado con márgenes
    const categories = Array.from(categoryMap.entries()).map(([catId, data]) => {
      const totalRevenue = Math.round(data.totalRevenue * 100) / 100
    const totalCost = Math.round(data.totalCost * 100) / 100
    const totalProfit = Math.round((totalRevenue - totalCost) * 100) / 100
    const profitMargin = totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 10000) / 100 : 0

    return {
      id: catId,
      categoryName: data.categoryName,
      totalQty: Math.round(data.totalQty * 100) / 100,
      totalRevenue,
      totalCost,
      totalProfit,
      profitMargin,
    }
  })

    // Ordenar por ingreso descendente
    categories.sort((a, b) => b.totalRevenue - a.totalRevenue)

    // Totales globales
    const grandTotal = categories.reduce(
      (acc, cat) => ({
        totalQty: acc.totalQty + cat.totalQty,
        totalRevenue: acc.totalRevenue + cat.totalRevenue,
        totalCost: acc.totalCost + cat.totalCost,
        totalProfit: acc.totalProfit + cat.totalProfit,
      }),
      { totalQty: 0, totalRevenue: 0, totalCost: 0, totalProfit: 0 }
    )

    const grandMargin = grandTotal.totalRevenue > 0
      ? Math.round((grandTotal.totalProfit / grandTotal.totalRevenue) * 10000) / 100
      : 0

    return NextResponse.json({
      categories,
      summary: {
        ...grandTotal,
        profitMargin: grandMargin,
      },
    })
  } catch (error) {
    console.error('[Category Revenue GET]', error)
    return NextResponse.json({ error: 'Error al generar reporte por categoría' }, { status: 500 })
  }
}
