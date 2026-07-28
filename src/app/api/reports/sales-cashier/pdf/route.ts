import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { getPermissions } from '@/lib/permissions'
import { fetchAppTz } from '@/lib/tz-helpers'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// GET /api/reports/sales-cashier/pdf?dateFrom=2025-07-01&dateTo=2025-07-15&branchId=xxx&userId=xxx
export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if ('status' in auth) return auth

  const perms = getPermissions(auth.role)
  if (!perms.views.includes('dashboard') && auth.role !== 'admin' && auth.role !== 'gerente') {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const dateFrom = searchParams.get('dateFrom')
  const dateTo = searchParams.get('dateTo')
  const branchId = searchParams.get('branchId') || undefined
  const userId = searchParams.get('userId') || undefined

  if (!dateFrom || !dateTo) {
    return NextResponse.json({ error: 'dateFrom y dateTo son requeridos' }, { status: 400 })
  }

  try {
    const data = await buildCashierReportData(dateFrom, dateTo, branchId, userId)

    const settings = await db.settings.findFirst({
      select: { businessName: true, rif: true, address: true, phone: true, primaryColor: true },
    })
    const businessName = settings?.businessName || 'JO-Administrativo'

    const pdfBuffer = generateCashierSalesPDF(data, businessName, branchId)

    const filename = `reporte_ventas_cajeros_${dateFrom}_${dateTo}.pdf`

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error('[SalesCashierPDF GET]', error)
    return NextResponse.json({ error: 'Error al generar PDF de ventas por cajero' }, { status: 500 })
  }
}

// ─── Data Builder (shared logic) ────────────────────────────────────────────

interface CashierData {
  userId: string
  userName: string
  role: string
  dailySales: number
  weeklySales: number
  monthlySales: number
  dailyTarget: number
  monthlyTarget: number
  dailyPct: number
  applyDailyAllMonth: boolean
  categories: { name: string; total: number }[]
}

interface ReportData {
  dateFrom: string
  dateTo: string
  branchId: string | null
  yearMonth: string
  cashiers: CashierData[]
}

async function buildCashierReportData(
  dateFrom: string,
  dateTo: string,
  branchId?: string,
  userId?: string
): Promise<ReportData> {
  const appTz = await fetchAppTz()

  const startDate = new Date(dateFrom + 'T00:00:00')
  const endDate = new Date(dateTo + 'T23:59:59.999')

  const refDate = new Date(dateFrom + 'T12:00:00')
  const localDate = new Date(refDate.toLocaleString('en-US', { timeZone: appTz.timezone }))
  const offsetMs = localDate.getTime() - refDate.getTime()
  const offsetHours = offsetMs / 3600000

  const utcStart = new Date(Date.UTC(
    startDate.getFullYear(), startDate.getMonth(), startDate.getDate(),
    -offsetHours, 0, 0, 0
  ))
  const utcEnd = new Date(Date.UTC(
    endDate.getFullYear(), endDate.getMonth(), endDate.getDate(),
    24 - offsetHours, 59, 59, 999
  ))

  // Week range
  const fromDate = new Date(dateFrom + 'T12:00:00')
  const localFromDate = new Date(fromDate.toLocaleString('en-US', { timeZone: appTz.timezone }))
  const dayOfWeek = localFromDate.getDay()
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const weekStart = new Date(localFromDate)
  weekStart.setDate(localFromDate.getDate() + mondayOffset)
  const weekStartStr = weekStart.toLocaleDateString('en-CA', { timeZone: appTz.timezone })
  const weekStartUtc = new Date(Date.UTC(
    weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate(),
    -offsetHours, 0, 0, 0
  ))
  const weekEndUtc = new Date(Date.UTC(
    weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6,
    24 - offsetHours, 59, 59, 999
  ))

  // Month range
  const [year, mon] = dateFrom.slice(0, 7).split('-').map(Number)
  const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate()
  const monthStartUtc = new Date(Date.UTC(year, mon - 1, 1, -offsetHours, 0, 0, 0))
  const monthEndUtc = new Date(Date.UTC(year, mon, lastDay, 24 - offsetHours, 59, 59, 999))

  const yearMonth = dateFrom.slice(0, 7)

  const whereUsers: Record<string, unknown> = {
    role: { in: ['cajero', 'vendedor', 'gerente', 'admin'] },
    ...(userId ? { id: userId } : {}),
  }

  const cashiers = await db.user.findMany({
    where: whereUsers,
    select: { id: true, name: true, role: true },
    orderBy: { name: 'asc' },
  })

  // Exclude credit sales from the totals
  const creditSaleIds = (await db.accountReceivable.findMany({
    where: { sale: { date: { gte: utcStart, lte: utcEnd } } },
    select: { saleId: true },
  })).map(r => r.saleId)

  const baseSaleWhere = {
    status: 'completada' as const,
    date: { gte: utcStart, lte: utcEnd },
    ...(creditSaleIds.length > 0 ? { id: { notIn: creditSaleIds } } : {}),
    ...(branchId ? { branchId } : {}),
  }

  const results: CashierData[] = []

  for (const cashier of cashiers) {
    const userFilter = { ...baseSaleWhere, userId: cashier.id }

    // Daily sales
    const dailySalesAgg = await db.sale.aggregate({
      where: userFilter,
      _sum: { total: true },
    })
    const dailySales = Math.round((dailySalesAgg._sum.total || 0) * 100) / 100

    // Weekly sales
    const weekCreditSaleIds = (await db.accountReceivable.findMany({
      where: { sale: { date: { gte: weekStartUtc, lte: weekEndUtc } } },
      select: { saleId: true },
    })).map(r => r.saleId)

    const weeklySalesAgg = await db.sale.aggregate({
      where: {
        status: 'completada',
        userId: cashier.id,
        date: { gte: weekStartUtc, lte: weekEndUtc },
        ...(weekCreditSaleIds.length > 0 ? { id: { notIn: weekCreditSaleIds } } : {}),
        ...(branchId ? { branchId } : {}),
      },
      _sum: { total: true },
    })
    const weeklySales = Math.round((weeklySalesAgg._sum.total || 0) * 100) / 100

    // Monthly sales
    const monthCreditSaleIds = (await db.accountReceivable.findMany({
      where: { sale: { date: { gte: monthStartUtc, lte: monthEndUtc } } },
      select: { saleId: true },
    })).map(r => r.saleId)

    const monthlySalesAgg = await db.sale.aggregate({
      where: {
        status: 'completada',
        userId: cashier.id,
        date: { gte: monthStartUtc, lte: monthEndUtc },
        ...(monthCreditSaleIds.length > 0 ? { id: { notIn: monthCreditSaleIds } } : {}),
        ...(branchId ? { branchId } : {}),
      },
      _sum: { total: true },
    })
    const monthlySales = Math.round((monthlySalesAgg._sum.total || 0) * 100) / 100

    // Category breakdown
    const categoryBreakdown = await db.saleLine.groupBy({
      by: ['productId'],
      where: { sale: userFilter },
      _sum: { lineTotal: true },
    })

    const productIds = categoryBreakdown.map(c => c.productId)
    const products = productIds.length > 0
      ? await db.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, category: { select: { name: true } } },
        })
      : []
    const productCategoryMap = new Map<string, string>(products.map(p => [p.id, p.category?.name || 'Sin categoría']))

    const categoryMap = new Map<string, number>()
    for (const item of categoryBreakdown) {
      const catName = productCategoryMap.get(String(item.productId)) || 'Sin categoría'
      categoryMap.set(catName, Math.round(((categoryMap.get(catName) || 0) + (item._sum.lineTotal || 0)) * 100) / 100)
    }
    const categories = Array.from(categoryMap.entries()).map(([name, total]) => ({ name, total }))

    // Sales target
    const target = await db.salesTarget.findUnique({
      where: { userId_yearMonth: { userId: cashier.id, yearMonth } },
      select: { targetAmount: true, dailyTargetAmount: true, applyDailyAllMonth: true },
    })

    let dailyTarget = target?.dailyTargetAmount || 0
    if (!dailyTarget && target?.targetAmount && target.targetAmount > 0) {
      let workingDays = 0
      const d = new Date(Date.UTC(year, mon - 1, 1))
      while (d.getUTCMonth() === mon - 1 && d.getUTCFullYear() === year) {
        const dow = d.getUTCDay()
        if (dow !== 0 && dow !== 6) workingDays++
        d.setUTCDate(d.getUTCDate() + 1)
      }
      dailyTarget = workingDays > 0 ? Math.round((target.targetAmount / workingDays) * 100) / 100 : 0
    }

    const dailyPct = dailyTarget > 0 ? Math.round((dailySales / dailyTarget) * 100) : 0

    results.push({
      userId: cashier.id,
      userName: cashier.name,
      role: cashier.role,
      dailySales,
      weeklySales,
      monthlySales,
      dailyTarget,
      monthlyTarget: target?.targetAmount || 0,
      dailyPct,
      applyDailyAllMonth: target?.applyDailyAllMonth || false,
      categories,
    })
  }

  results.sort((a, b) => b.dailySales - a.dailySales)

  return {
    dateFrom,
    dateTo,
    branchId: branchId || null,
    yearMonth,
    cashiers: results,
  }
}

// ─── PDF Generation ──────────────────────────────────────────────────────────

function generateCashierSalesPDF(
  data: ReportData,
  businessName: string,
  branchId?: string
): Buffer {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' })
  const pw = doc.internal.pageSize.getWidth()
  const margin = 36
  const contentW = pw - margin * 2
  let y = margin

  // ── Header ──
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(17, 24, 39)
  doc.text(businessName, pw / 2, y, { align: 'center' })
  y += 26

  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text('Reporte de Ventas por Cajero', pw / 2, y, { align: 'center' })
  y += 22

  // Sub-header info
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(107, 114, 128)
  doc.text(`Período: ${data.dateFrom} al ${data.dateTo}`, margin, y)
  y += 14
  if (branchId) {
    doc.text(`Sucursal: ${branchId}`, margin, y)
    y += 14
  }
  doc.text(`Mes de referencia: ${data.yearMonth}`, margin, y)
  y += 20

  // ── Summary Table ──
  const summaryHeaders = [
    ['Cajero', 'Ventas del Día', 'Ventas Semanales', 'Ventas Mensuales', 'Meta Diaria', '% Avance'],
  ]

  const summaryBody = data.cashiers.map((c) => [
    c.userName,
    fmtNum(c.dailySales),
    fmtNum(c.weeklySales),
    fmtNum(c.monthlySales),
    fmtNum(c.dailyTarget),
    c.dailyPct + '%',
  ])

  autoTable(doc, {
    startY: y,
    head: summaryHeaders,
    body: summaryBody,
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
      0: { cellWidth: 120 },
      1: { halign: 'right', cellWidth: 80 },
      2: { halign: 'right', cellWidth: 80 },
      3: { halign: 'right', cellWidth: 80 },
      4: { halign: 'right', cellWidth: 70 },
      5: { halign: 'center', cellWidth: 50 },
    },
    alternateRowStyles: {
      fillColor: [249, 250, 251],
    },
    didParseCell(data) {
      if (data.section === 'body' && data.column.index === 5) {
        const val = parseFloat(String(data.cell.raw).replace('%', '')) || 0
        if (val >= 100) {
          data.cell.styles.textColor = [5, 150, 105]
          data.cell.styles.fontStyle = 'bold'
        } else if (val >= 70) {
          data.cell.styles.textColor = [217, 119, 6]
        } else if (val > 0) {
          data.cell.styles.textColor = [220, 38, 38]
        }
      }
    },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let lastY = (doc as any).lastAutoTable.finalY + 10

  // ── Category Breakdown per Cashier ──
  for (const cashier of data.cashiers) {
    if (cashier.categories.length === 0) continue

    // Check page space
    const neededSpace = 30 + cashier.categories.length * 18 + 20
    if (lastY + neededSpace > doc.internal.pageSize.getHeight() - 50) {
      doc.addPage()
      lastY = margin
    }

    // Cashier sub-header
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(31, 41, 55)
    doc.text(`Desglose por Categoría — ${cashier.userName}`, margin, lastY)
    lastY += 6

    // Draw accent line
    doc.setDrawColor(31, 41, 55)
    doc.setLineWidth(1)
    doc.line(margin, lastY, margin + contentW, lastY)
    lastY += 10

    const catHeaders = [['Categoría', 'Total Ventas']]
    const catBody = cashier.categories.map((cat) => [
      cat.name,
      fmtNum(cat.total),
    ])

    autoTable(doc, {
      startY: lastY,
      head: catHeaders,
      body: catBody,
      margin: { left: margin, right: margin },
      styles: {
        fontSize: 8,
        cellPadding: 3,
        textColor: [55, 65, 81],
        lineColor: [243, 244, 246],
        lineWidth: 0.3,
      },
      headStyles: {
        fillColor: [55, 65, 81],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7,
        halign: 'center',
      },
      columnStyles: {
        0: { cellWidth: 250 },
        1: { halign: 'right', cellWidth: 150 },
      },
      alternateRowStyles: {
        fillColor: [250, 251, 252],
      },
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lastY = (doc as any).lastAutoTable.finalY + 20
  }

  // ── Grand Totals ──
  // Check page space
  if (lastY + 50 > doc.internal.pageSize.getHeight() - 50) {
    doc.addPage()
    lastY = margin
  }

  const totalDaily = data.cashiers.reduce((s, c) => s + c.dailySales, 0)
  const totalWeekly = data.cashiers.reduce((s, c) => s + c.weeklySales, 0)
  const totalMonthly = data.cashiers.reduce((s, c) => s + c.monthlySales, 0)
  const avgAdvance = data.cashiers.length > 0
    ? Math.round(data.cashiers.reduce((s, c) => s + c.dailyPct, 0) / data.cashiers.length)
    : 0

  doc.setFillColor(240, 242, 245)
  doc.rect(margin, lastY, contentW, 50, 'F')
  doc.setDrawColor(31, 41, 55)
  doc.setLineWidth(1)
  doc.line(margin, lastY, margin, lastY + 50)
  doc.line(margin, lastY, margin + contentW, lastY)
  doc.line(margin, lastY + 50, margin + contentW, lastY + 50)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(17, 24, 39)
  doc.text('RESUMEN GENERAL', margin + 10, lastY + 16)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(`Ventas Totales del Día:`, margin + 10, lastY + 33)
  doc.text(`Ventas Semanales:`, margin + 10, lastY + 44)
  doc.setFont('helvetica', 'bold')
  doc.text(fmtNum(totalDaily), margin + 160, lastY + 33)
  doc.text(fmtNum(totalWeekly), margin + 160, lastY + 33 + 11)

  doc.setFont('helvetica', 'normal')
  doc.text(`Ventas Mensuales:`, margin + 260, lastY + 33)
  doc.text(`% Avance Promedio:`, margin + 260, lastY + 44)
  doc.setFont('helvetica', 'bold')
  doc.text(fmtNum(totalMonthly), margin + 400, lastY + 33)
  doc.text(`${avgAdvance}%`, margin + 400, lastY + 44)

  // ── Page footers ──
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    const ph = doc.internal.pageSize.getHeight()
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(156, 163, 175)
    doc.text(
      `Generado por JO-Administrativo — Página ${i} de ${pageCount}`,
      pw / 2,
      ph - 20,
      { align: 'center' }
    )
  }

  return Buffer.from(doc.output('arraybuffer'))
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  return `$${n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
