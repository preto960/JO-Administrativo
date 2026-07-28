import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { fetchAppTz, fetchNow } from '@/lib/tz-helpers'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// Color resolution helpers (same pattern as expired-today/pdf)
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

// GET /api/reports/financial/statement/pdf — generate ERI PDF for financial statement
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

    // Get all active cost centers
    const costCenters = await db.costCenter.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    })

    // Get all cost entries in date range
    const costEntries = await db.costEntry.findMany({
      where: { date: { gte: startDate, lte: endDate } },
      select: { costCenterId: true, amount: true },
    })

    // Build month filter for budgets
    const startYear = startDate.getFullYear()
    const startMonth = startDate.getMonth() + 1
    const endYear = endDate.getFullYear()
    const endMonth = endDate.getMonth() + 1
    const monthFilters: string[] = []
    let y = startYear
    let m = startMonth
    while (y < endYear || (y === endYear && m <= endMonth)) {
      monthFilters.push(`${y}-${String(m).padStart(2, '0')}`)
      m++
      if (m > 12) { m = 1; y++ }
    }

    const budgets = await db.expenseBudget.findMany({
      where: { yearMonth: { in: monthFilters } },
      select: { costCenterId: true, budgetAmount: true },
    })

    // Aggregate by cost center
    const entriesByCenter = new Map<string, number>()
    for (const e of costEntries) {
      entriesByCenter.set(e.costCenterId, (entriesByCenter.get(e.costCenterId) || 0) + e.amount)
    }

    const budgetByCenter = new Map<string, number>()
    for (const b of budgets) {
      budgetByCenter.set(b.costCenterId, (budgetByCenter.get(b.costCenterId) || 0) + b.budgetAmount)
    }

    // Build center data
    const centers = costCenters.map((cc) => {
      const budget = budgetByCenter.get(cc.id) || 0
      const actual = entriesByCenter.get(cc.id) || 0
      const variance = budget - actual
      const pct = budget > 0 ? (actual / budget) * 100 : 0
      return {
        name: cc.name,
        code: cc.code || '',
        budget,
        actual,
        variance,
        pct,
      }
    })

    const totalBudget = centers.reduce((s, c) => s + c.budget, 0)
    const totalActual = centers.reduce((s, c) => s + c.actual, 0)
    const totalVariance = totalBudget - totalActual
    const totalPct = totalBudget > 0 ? (totalActual / totalBudget) * 100 : 0

    // ─── Generate PDF ───────────────────────────────────────────────────────────

    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' })
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
    doc.text('ESTADO DE RESULTADO POR CENTRO DE COSTO', textX, 40)

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(`Período: ${dateFrom} al ${dateTo}`, textX, 58)
    if (branch) doc.text(`Sucursal: ${branch.name}`, textX, 73)

    let yPos = 100

    // Business info bar
    doc.setFillColor(245, 247, 250)
    doc.rect(30, yPos, pw - 60, 25, 'F')
    doc.setTextColor(60, 60, 60)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text(businessName, 40, yPos + 16)
    if (businessRif) doc.text(`RIF: ${businessRif}`, 250, yPos + 16)
    if (businessAddress) doc.text(businessAddress, 420, yPos + 16)

    yPos += 35

    // Main table
    const tableHeaders = [['CENTRO DE COSTO', 'PRESUPUESTO', 'GASTO REAL', 'VARIACIÓN', '% UTILIZADO']]
    const tableBody = centers.map((c) => [
      c.code ? `[${c.code}] ${c.name}` : c.name,
      fmtNum(c.budget),
      fmtNum(c.actual),
      fmtNum(c.variance),
      c.pct.toFixed(1) + '%',
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
        0: { cellWidth: 190 },
        1: { cellWidth: 90, halign: 'right' },
        2: { cellWidth: 90, halign: 'right' },
        3: { cellWidth: 90, halign: 'right' },
        4: { cellWidth: 70, halign: 'center' },
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      didParseCell: (data) => {
        // Color variance: red if negative (over budget), green if positive
        if (data.section === 'body' && data.column.index === 3) {
          const val = parseFloat(String(data.cell.raw).replace(/[,%]/g, '')) || 0
          if (val < 0) {
            data.cell.styles.textColor = [220, 38, 38]
          } else if (val > 0) {
            data.cell.styles.textColor = [5, 150, 105]
          }
        }
        // Color percent used: red if > 100%, green if < 80%
        if (data.section === 'body' && data.column.index === 4) {
          const pctVal = parseFloat(String(data.cell.raw).replace('%', '')) || 0
          if (pctVal > 100) {
            data.cell.styles.textColor = [220, 38, 38]
          } else if (pctVal < 80) {
            data.cell.styles.textColor = [5, 150, 105]
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

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text(fmtNum(totalBudget), 350, summaryY + 18, { align: 'right' })
    doc.text(fmtNum(totalActual), 440, summaryY + 18, { align: 'right' })

    doc.setTextColor(totalVariance < 0 ? 220 : 5, totalVariance < 0 ? 38 : 150, totalVariance < 0 ? 38 : 105)
    doc.text(fmtNum(totalVariance), 530, summaryY + 18, { align: 'right' })

    // Footer on each page
    const totalPages = doc.getNumberOfPages()
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i)
      const ph = doc.internal.pageSize.getHeight()
      doc.setFontSize(7)
      doc.setTextColor(140, 140, 140)
      doc.setFont('helvetica', 'normal')
      doc.text(`(Página ${i} de ${totalPages})`, pw / 2, ph - 20, { align: 'center' })
      doc.text(`${businessName} ${businessRif ? '- RIF: ' + businessRif : ''} ${businessAddress ? '- ' + businessAddress : ''}`, pw / 2, ph - 10, { align: 'center' })
    }

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'))
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="ERI_${dateFrom}_${dateTo}.pdf"`,
      },
    })
  } catch (error) {
    console.error('[StatementPDF GET]', error)
    return NextResponse.json({ error: 'Error al generar PDF del estado financiero' }, { status: 500 })
  }
}
