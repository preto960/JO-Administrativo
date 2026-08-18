import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { fetchAppTz, fetchNow } from '@/lib/tz-helpers'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// Color resolution helpers (same pattern as statement/pdf)
const COLOR_MAP: Record<string, number[]> = {
  emerald: [5, 150, 105],
  blue: [37, 99, 235],
  purple: [124, 58, 237],
  rose: [244, 63, 94],
  orange: [234, 88, 12],
  teal: [13, 148, 136],
  cyan: [6, 182, 212],
  indigo: [79, 70, 229],
  pink: [236, 72, 153],
  amber: [217, 119, 6],
  lime: [101, 163, 13],
  red: [220, 38, 38],
  sky: [14, 165, 233],
  fuchsia: [192, 38, 211],
  slate: [71, 85, 105],
  zinc: [82, 82, 91],
  stone: [87, 83, 78],
  neutral: [82, 82, 91],
}

function hexToRgb(hex: string): number[] | null {
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i)
  if (!m) return null
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
}

function resolveColor(primaryColor: string): number[] {
  return COLOR_MAP[primaryColor] || hexToRgb(primaryColor) || [37, 99, 235]
}

function fmtNum(n: number): string {
  return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// GET /api/reports/financial/category-revenue/pdf — generate PDF for category revenue report
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

    const appTz = await fetchAppTz()
    const now = await fetchNow(appTz.timezone)

    // Get settings
    const settings = await db.settings.findFirst({
      select: { businessName: true, rif: true, address: true, phone: true, logoUrl: true, primaryColor: true },
    })
    const businessName = settings?.businessName || 'JO-Administrativo'
    const businessRif = settings?.rif || ''
    const businessAddress = settings?.address || ''
    const logoUrl = settings?.logoUrl || ''
    const primaryColor = resolveColor(settings?.primaryColor || 'blue')

    // Get branch info
    const branch = branchId ? await db.branch.findUnique({ where: { id: branchId }, select: { name: true } }) : null

    // Get sale lines with product/category info
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

    // Group by category
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

    // Build result with margins
    const categories = Array.from(categoryMap.entries()).map(([, data]) => {
      const totalRevenue = Math.round(data.totalRevenue * 100) / 100
      const totalCost = Math.round(data.totalCost * 100) / 100
      const totalProfit = Math.round((totalRevenue - totalCost) * 100) / 100
      const profitMargin = totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 10000) / 100 : 0

      return {
        categoryName: data.categoryName,
        totalQty: Math.round(data.totalQty * 100) / 100,
        totalRevenue,
        totalCost,
        totalProfit,
        profitMargin,
      }
    })

    // Sort by revenue descending
    categories.sort((a, b) => b.totalRevenue - a.totalRevenue)

    // Grand totals
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

    // ─── Generate PDF ───────────────────────────────────────────────────────────

    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' })
    const pw = doc.internal.pageSize.getWidth()

    // Header band
    doc.setFillColor(...primaryColor)
    doc.rect(0, 0, pw, 90, 'F')

    let logoDrawn = false
    if (logoUrl) {
      try {
        const logoRes = await fetch(logoUrl)
        if (logoRes.ok) {
          const logoBuf = Buffer.from(await logoRes.arrayBuffer())
          const base64 = `data:image/png;base64,${logoBuf.toString('base64')}`
          doc.addImage(base64, 'PNG', 40, 15, 60, 60)
          logoDrawn = true
        }
      } catch { /* skip logo */ }
    }

    const textX = logoDrawn ? 115 : 40
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.text('INGRESOS POR CATEGORÍA', textX, 40)

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(`Período: ${dateFrom} al ${dateTo}`, textX, 58)
    if (branch) doc.text(`Sucursal: ${branch.name}`, textX, 73)

    // Generated datetime on the right side of the header
    doc.setFontSize(8)
    doc.text(`Generado: ${now.format('dd/MM/yyyy HH:mm')}`, pw - 40, 80, { align: 'right' })

    let yPos = 100

    // Business info bar
    doc.setFillColor(245, 247, 250)
    doc.rect(30, yPos, pw - 60, 25, 'F')
    doc.setTextColor(60, 60, 60)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text(businessName, 40, yPos + 16)
    if (businessRif) doc.text(`RIF: ${businessRif}`, 300, yPos + 16)
    if (businessAddress) doc.text(businessAddress, 480, yPos + 16)

    yPos += 35

    // Main table
    const tableHeaders = [['CATEGORÍA', 'CANTIDAD', 'INGRESOS', 'COSTO', 'GANANCIA', 'MARGEN %']]
    const tableBody = categories.map((c) => [
      c.categoryName,
      fmtNum(c.totalQty),
      fmtNum(c.totalRevenue),
      fmtNum(c.totalCost),
      fmtNum(c.totalProfit),
      c.profitMargin.toFixed(1) + '%',
    ])

    autoTable(doc, {
      startY: yPos,
      margin: { left: 30, right: 30 },
      theme: 'grid',
      head: tableHeaders,
      body: tableBody,
      headStyles: {
        fillColor: primaryColor,
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: 'bold',
        halign: 'center',
        cellPadding: 5,
      },
      bodyStyles: {
        fontSize: 8,
        cellPadding: 4,
        textColor: [40, 40, 40],
      },
      columnStyles: {
        0: { cellWidth: 220 },
        1: { cellWidth: 80, halign: 'right' },
        2: { cellWidth: 110, halign: 'right' },
        3: { cellWidth: 110, halign: 'right' },
        4: { cellWidth: 110, halign: 'right' },
        5: { cellWidth: 70, halign: 'center' },
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      didParseCell: (data) => {
        // Color margin: green >= 50%, gray 20-50%, red < 20%
        if (data.section === 'body' && data.column.index === 5) {
          const pctVal = parseFloat(String(data.cell.raw).replace('%', '')) || 0
          if (pctVal >= 50) {
            data.cell.styles.textColor = [5, 150, 105]
          } else if (pctVal < 20) {
            data.cell.styles.textColor = [220, 38, 38]
          } else {
            data.cell.styles.textColor = [107, 114, 128]
          }
        }
      },
    })

    // Get Y position after table for summary section
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const finalY = ((doc as any).lastAutoTable?.finalY as number) || yPos + 200

    // Summary section
    let summaryY = finalY + 20

    doc.setFillColor(240, 242, 245)
    doc.rect(30, summaryY, pw - 60, 28, 'F')
    doc.setDrawColor(...primaryColor)
    doc.setLineWidth(1)
    doc.line(30, summaryY, 30, summaryY + 28)
    doc.line(30, summaryY, pw - 30, summaryY)
    doc.line(30, summaryY + 28, pw - 30, summaryY + 28)

    doc.setTextColor(40, 40, 40)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text('TOTALES', 40, summaryY + 18)

    // Calculate X positions to align with columns
    const col1X = 30 + 220 // after Categoría column
    const col2X = col1X + 80  // after Cantidad column
    const col3X = col2X + 110 // after Ingresos column
    const col4X = col3X + 110 // after Costo column
    const col5X = col4X + 110 // after Ganancia column

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text('', col1X, summaryY + 18, { align: 'right' })
    doc.text(fmtNum(grandTotal.totalRevenue), col3X, summaryY + 18, { align: 'right' })
    doc.text(fmtNum(grandTotal.totalCost), col4X, summaryY + 18, { align: 'right' })

    doc.setTextColor(grandTotal.totalProfit < 0 ? 220 : 5, grandTotal.totalProfit < 0 ? 38 : 150, grandTotal.totalProfit < 0 ? 38 : 105)
    doc.text(fmtNum(grandTotal.totalProfit), col5X, summaryY + 18, { align: 'right' })

    // Global margin
    doc.setTextColor(grandMargin >= 50 ? 5 : grandMargin < 20 ? 220 : 107, grandMargin >= 50 ? 150 : grandMargin < 20 ? 38 : 114, grandMargin >= 50 ? 105 : grandMargin < 20 ? 38 : 128)
    doc.text(`Margen Global: ${grandMargin.toFixed(1)}%`, col5X + 70, summaryY + 18, { align: 'left' })

    // Footer on each page
    const totalPages = doc.getNumberOfPages()
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i)
      const ph = doc.internal.pageSize.getHeight()
      doc.setFontSize(7)
      doc.setTextColor(140, 140, 140)
      doc.setFont('helvetica', 'normal')
      doc.text(`Generado por JO-Administrativo`, pw / 2, ph - 20, { align: 'center' })
      doc.text(`(Página ${i} de ${totalPages})`, pw / 2, ph - 10, { align: 'center' })
    }

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'))
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Ingresos_por_Categoria_${dateFrom}_${dateTo}.pdf"`,
      },
    })
  } catch (error) {
    console.error('[CategoryRevenuePDF GET]', error)
    return NextResponse.json({ error: 'Error al generar PDF de ingresos por categoría' }, { status: 500 })
  }
}
