import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { getPermissions } from '@/lib/permissions'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// GET /api/reports/inventory-admin/monthly/pdf — Generate PDF for monthly inventory report
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

    // branchId is optional — when not provided, fetch all branches

    // ── Fetch data (same logic as monthly route) ──
    const [yearStr, monthStr] = yearMonth.split('-')
    const year = parseInt(yearStr, 10)
    const month = parseInt(monthStr, 10)

    const startDate = new Date(year, month - 1, 1)
    const endDate = new Date(year, month, 0, 23, 59, 59, 999)

    const branch = await db.branch.findUnique({ where: { id: branchId }, select: { name: true } })
    // Build branch filter — null means all branches
    const branchFilter: Record<string, unknown> = branchId ? { branchId } : {}
    const branchName = branch
      ? branch.name
      : 'Todas las Sucursales'

    const inventoryItems = await db.inventory.findMany({
      where: branchFilter,
      include: {
        product: {
          select: { id: true, name: true, active: true, sku: true, currency: { select: { symbol: true, code: true } } },
        },
      },
    })

    const activeInventory = inventoryItems.filter(inv => inv.product.active)

    // Sales aggregation
    const salesData = await db.saleLine.findMany({
      where: {
        sale: {
          ...(branchId ? { branchId } : {}),
          date: { gte: startDate, lte: endDate },
          status: 'completada',
        },
      },
      select: { productId: true, quantity: true },
    })
    const salesByProduct = new Map<string, number>()
    for (const line of salesData) {
      salesByProduct.set(line.productId, (salesByProduct.get(line.productId) || 0) + line.quantity)
    }

    // Adjustments aggregation
    const adjustments = await db.inventoryAdjustment.findMany({
      where: {
        ...(branchId ? { branchId } : {}),
        createdAt: { gte: startDate, lte: endDate },
        type: { in: ['perdida', 'obsequio'] },
      },
      select: { productId: true, type: true, quantity: true },
    })
    const perdidasByProduct = new Map<string, number>()
    const obsequiosByProduct = new Map<string, number>()
    for (const adj of adjustments) {
      if (adj.type === 'perdida') {
        perdidasByProduct.set(adj.productId, (perdidasByProduct.get(adj.productId) || 0) + adj.quantity)
      } else if (adj.type === 'obsequio') {
        obsequiosByProduct.set(adj.productId, (obsequiosByProduct.get(adj.productId) || 0) + adj.quantity)
      }
    }

    // Build rows
    const rows = activeInventory.map(inv => ({
      productName: inv.product.name,
      salesQty: Math.round((salesByProduct.get(inv.productId) || 0) * 100) / 100,
      currentStock: inv.stock,
      perdidasQty: Math.round((perdidasByProduct.get(inv.productId) || 0) * 100) / 100,
      obsequiosQty: Math.round((obsequiosByProduct.get(inv.productId) || 0) * 100) / 100,
    }))

    const totals = {
      salesQty: Math.round(rows.reduce((s, r) => s + r.salesQty, 0) * 100) / 100,
      currentStock: Math.round(rows.reduce((s, r) => s + r.currentStock, 0) * 100) / 100,
      perdidasQty: Math.round(rows.reduce((s, r) => s + r.perdidasQty, 0) * 100) / 100,
      obsequiosQty: Math.round(rows.reduce((s, r) => s + r.obsequiosQty, 0) * 100) / 100,
    }

    // ── Generate PDF ──
    const settings = await db.settings.findFirst()
    const businessName = settings?.businessName || 'JO-Administrativo'

    const pdfBuffer = generateMonthlyInventoryPDF({
      businessName,
      branchName,
      yearMonth,
      rows,
      totals,
    })

    const branchSlug = branchId ? branchName.replace(/\s+/g, '_') : 'todas'
    const filename = `inventario_mensual_${branchSlug}_${yearMonth}.pdf`

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error('[GET inventory-admin/monthly/pdf]', error)
    return NextResponse.json({ error: 'Error al generar PDF mensual de inventario' }, { status: 500 })
  }
}

// ─── PDF Generation ──────────────────────────────────────────────────────────

interface MonthlyReportData {
  businessName: string
  branchName: string
  yearMonth: string
  rows: {
    productName: string
    salesQty: number
    currentStock: number
    perdidasQty: number
    obsequiosQty: number
  }[]
  totals: {
    salesQty: number
    currentStock: number
    perdidasQty: number
    obsequiosQty: number
  }
}

function generateMonthlyInventoryPDF(data: MonthlyReportData): Uint8Array {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' })

  const pageW = doc.internal.pageSize.getWidth()
  const margin = 40
  const contentW = pageW - margin * 2

  let y = margin

  // ── Header ──
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(17, 24, 39)
  doc.text(data.businessName, pageW / 2, y, { align: 'center' })
  y += 28

  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text('Reporte Mensual de Inventario', pageW / 2, y, { align: 'center' })
  y += 24

  // Month/Year label
  const [yearStr, monthStr] = data.yearMonth.split('-')
  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ]
  const monthLabel = `${monthNames[parseInt(monthStr, 10) - 1]} ${yearStr}`

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(107, 114, 128)
  doc.text(`Período: ${monthLabel}`, margin, y)
  doc.text(`Sucursal: ${data.branchName}`, pageW - margin, y, { align: 'right' })
  y += 20

  // ── Table ──
  const tableBody = data.rows.map(row => [
    row.productName,
    formatNumber(row.salesQty),
    formatNumber(row.currentStock),
    formatNumber(row.perdidasQty),
    formatNumber(row.obsequiosQty),
  ])

  // Add totals row
  tableBody.push([
    'TOTALES',
    formatNumber(data.totals.salesQty),
    formatNumber(data.totals.currentStock),
    formatNumber(data.totals.perdidasQty),
    formatNumber(data.totals.obsequiosQty),
  ])

  autoTable(doc, {
    startY: y,
    head: [['Producto', 'Ventas del Mes', 'Stock Actual', 'Pérdidas', 'Obsequios']],
    body: tableBody,
    margin: { left: margin, right: margin },
    styles: {
      fontSize: 8,
      cellPadding: 4,
      textColor: [17, 24, 39],
      lineColor: [229, 231, 235],
      lineWidth: 0.5,
    },
    headStyles: {
      fillColor: [31, 41, 55],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'center',
    },
    columnStyles: {
      1: { halign: 'center' },
      2: { halign: 'center' },
      3: { halign: 'center' },
      4: { halign: 'center' },
    },
    alternateRowStyles: {
      fillColor: [249, 250, 251],
    },
    didParseCell(data: { section: string; row: { index: number }; column: { index: number }; cell: { styles: { fillColor: number[]; textColor: number[]; fontStyle: string } } }) {
      // Style the totals row (last row)
      if (data.section === 'body' && data.row.index === tableBody.length - 1) {
        data.cell.styles.fillColor = [243, 244, 246] // gray-100
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.textColor = [17, 24, 39]
      }
    },
  })

  // ── Page footer ──
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    const pageH = doc.internal.pageSize.getHeight()
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(156, 163, 175)
    doc.text(
      `Generado por JO-Administrativo — Página ${i} de ${pageCount}`,
      pageW / 2,
      pageH - 20,
      { align: 'center' }
    )
  }

  return new Uint8Array(doc.output('arraybuffer'))
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  return n.toLocaleString('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}
