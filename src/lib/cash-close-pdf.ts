import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Prisma } from '@prisma/client'
import { getPaymentMethodsFromDB, FALLBACK_METHODS } from './payment-methods'
import { fetchAppTz } from './tz-helpers'

// ─── Module-level TZ state (set by exported functions before calling helpers) ──
let _tz: string | undefined
let _locale: string | undefined

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SaleDetail {
  id: string
  date: Date
  clientName: string | null
  total: number
  lines: {
    productName: string
    quantity: number
    unitPrice: number
    lineTotal: number
  }[]
  payments: {
    method: string
    amount: number
    currencyCode: string
    reference: string | null
  }[]
}

export interface MethodBreakdown {
  method: string
  amount: number
  count: number
}

export interface CashCloseReport {
  businessName: string
  businessRif: string
  businessAddress: string
  businessPhone: string
  businessEmail: string
  logoUrl: string
  registerId: string
  registerName: string | null
  branchName: string
  cashierName: string
  openingDate: Date
  closingDate: Date
  initialAmt: number
  totalSales: number
  totalExpenses: number
  totalEntries: number
  totalRetiros: number
  expected: number
  actual: number
  difference: number
  sales: SaleDetail[]
  expenses: { concept: string; amount: number; date: Date }[]
  entries: { concept: string; amount: number; date: Date }[]
  exchangeRate: number
  referenceCurrency: string
  ivaEnabled: boolean
  ivaRate: number
  // New reconciliation fields
  cashCreditPayments: number
  otherEntries: { concept: string; amount: number; date: Date }[]
  creditPaymentsByMethod: MethodBreakdown[]
  totalCollected: number
  salesByMethod: MethodBreakdown[]
}

// ─── Colors ───────────────────────────────────────────────────────────────────

const C = {
  primary: [30, 64, 175] as [number, number, number],
  primaryLight: [59, 130, 246] as [number, number, number],
  primarySoft: [239, 246, 255] as [number, number, number],
  green: [22, 163, 74] as [number, number, number],
  greenSoft: [240, 253, 244] as [number, number, number],
  red: [220, 38, 38] as [number, number, number],
  redSoft: [254, 242, 242] as [number, number, number],
  amber: [180, 83, 9] as [number, number, number],
  gray: [107, 114, 128] as [number, number, number],
  grayLight: [243, 244, 246] as [number, number, number],
  grayMedium: [229, 231, 235] as [number, number, number],
  dark: [17, 24, 39] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  blueBg: [224, 231, 255] as [number, number, number],
  yellowBg: [255, 251, 235] as [number, number, number],
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(amount: number, decimals = 2): string {
  return amount.toLocaleString('es-VE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function fmtDate(d: Date): string {
  const opts: Intl.DateTimeFormatOptions = {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }
  if (_tz) opts.timeZone = _tz
  return d.toLocaleString(_locale || 'es-VE', opts)
}

function fmtDateShort(d: Date): string {
  const opts: Intl.DateTimeFormatOptions = {
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }
  if (_tz) opts.timeZone = _tz
  return d.toLocaleString(_locale || 'es-VE', opts)
}

function cs(refCurrency: string): string {
  return refCurrency === 'EUR' ? '\u20ac' : '$'
}

// ─── Drawing helpers ──────────────────────────────────────────────────────────

/**
 * Header with gradient-style blue bar, optional logo, business name, and title.
 */
async function drawHeader(doc: jsPDF, report: CashCloseReport): Promise<number> {
  const pw = doc.internal.pageSize.getWidth()

  // Top accent line
  doc.setFillColor(...C.primaryLight)
  doc.rect(0, 0, pw, 3, 'F')

  // Main header band
  doc.setFillColor(...C.primary)
  doc.rect(0, 3, pw, 64, 'F')

  // Bottom decorative line
  doc.setFillColor(...C.primaryLight)
  doc.rect(0, 67, pw, 2, 'F')

  let logoDrawn = false
  if (report.logoUrl) {
    try {
      const logoRes = await fetch(report.logoUrl)
      if (logoRes.ok) {
        const logoBuf = Buffer.from(await logoRes.arrayBuffer())
        const base64 = `data:image/png;base64,${logoBuf.toString('base64')}`
        doc.addImage(base64, 'PNG', 36, 13, 48, 48)
        logoDrawn = true
      }
    } catch { /* skip logo */ }
  }

  const textX = logoDrawn ? 96 : 36

  // Business name (small, above title)
  doc.setFontSize(8)
  doc.setTextColor(200, 210, 240)
  doc.setFont('helvetica', 'normal')
  doc.text(report.businessName.toUpperCase(), textX, 20)

  // Main title
  doc.setFontSize(18)
  doc.setTextColor(...C.white)
  doc.setFont('helvetica', 'bold')
  doc.text('Cierre de Caja', textX, 36)

  // Subtitle with RIF
  doc.setFontSize(8)
  doc.setTextColor(180, 195, 230)
  doc.setFont('helvetica', 'normal')
  const rifPart = report.businessRif ? `  |  RIF: ${report.businessRif}` : ''
  doc.text(`Reporte de cierre de turno${rifPart}`, textX, 47)

  // Date badge on the right
  doc.setFillColor(255, 255, 255)
  doc.setDrawColor(...C.primary)
  doc.setLineWidth(0.5)
  const badgeX = pw - 36
  const badgeW = 130
  const badgeH = 22
  const badgeY = 22
  doc.roundedRect(badgeX - badgeW, badgeY, badgeW, badgeH, 3, 3, 'FD')
  doc.setFontSize(7)
  doc.setTextColor(...C.gray)
  doc.text('FECHA DE CIERRE', badgeX - badgeW / 2, badgeY + 7, { align: 'center' })
  doc.setFontSize(9)
  doc.setTextColor(...C.dark)
  doc.setFont('helvetica', 'bold')
  doc.text(fmtDateShort(report.closingDate), badgeX - badgeW / 2, badgeY + 16, { align: 'center' })

  return 82
}

/**
 * Info card: Cajero, Caja, Sucursal with subtle icons (text-based).
 */
function drawInfoCard(doc: jsPDF, report: CashCloseReport, startY: number): number {
  const pw = doc.internal.pageSize.getWidth()
  const margin = 36
  let y = startY

  autoTable(doc, {
    startY: y,
    theme: 'grid',
    margin: { left: margin, right: margin },
    body: [
      [
        { content: 'Cajero', styles: { fontStyle: 'bold', textColor: C.white, fillColor: C.primary, cellPadding: 6, fontSize: 8 } },
        { content: report.cashierName, styles: { textColor: C.dark, cellPadding: 6, fontSize: 9 } },
        { content: 'Sucursal', styles: { fontStyle: 'bold', textColor: C.white, fillColor: C.primary, cellPadding: 6, fontSize: 8 } },
        { content: report.branchName, styles: { textColor: C.dark, cellPadding: 6, fontSize: 9 } },
      ],
      [
        { content: 'Caja', styles: { fontStyle: 'bold', textColor: C.white, fillColor: C.primary, cellPadding: 6, fontSize: 8 } },
        { content: report.registerName || 'Sin nombre', styles: { textColor: C.dark, cellPadding: 6, fontSize: 9 } },
        { content: 'Apertura', styles: { fontStyle: 'bold', textColor: C.white, fillColor: C.primary, cellPadding: 6, fontSize: 8 } },
        { content: fmtDateShort(report.openingDate), styles: { textColor: C.dark, cellPadding: 6, fontSize: 9 } },
      ],
    ],
    styles: {
      fillColor: [255, 255, 255],
      lineWidth: 0.3,
      lineColor: C.grayMedium,
    },
    columnStyles: {
      0: { cellWidth: '18%' as any },
      1: { cellWidth: '32%' as any },
      2: { cellWidth: '18%' as any },
      3: { cellWidth: '32%' as any },
    },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (doc as any).lastAutoTable.finalY + 16
}

/**
 * Resumen de Efectivo en Caja: clear step-by-step calculation of physical cash.
 */
function drawCashSummary(doc: jsPDF, report: CashCloseReport, startY: number): number {
  const symbol = cs(report.referenceCurrency)
  let y = startY

  // Section title with accent bar
  doc.setFillColor(...C.primary)
  doc.rect(36, y, 4, 14, 'F')
  doc.setFontSize(12)
  doc.setTextColor(...C.primary)
  doc.setFont('helvetica', 'bold')
  doc.text('Resumen de Efectivo en Caja', 46, y + 11)
  y += 18

  // Calculate other entries total
  const otherEntriesTotal = report.otherEntries.reduce((s, e) => s + e.amount, 0)

  // Calculate IVA if applicable
  let ivaAmount = 0
  if (report.ivaEnabled && report.ivaRate > 0) {
    ivaAmount = Math.round((report.totalSales + report.cashCreditPayments) * (report.ivaRate / 100) * 100) / 100
  }

  // Calculate total cash in drawer
  const totalInCash = Math.round((report.initialAmt + otherEntriesTotal + report.totalSales + report.cashCreditPayments + ivaAmount - report.totalExpenses - report.totalRetiros) * 100) / 100

  // Build rows: clear step-by-step
  const rows: any[][] = [
    [
      { content: 'Monto de Apertura', styles: { textColor: C.dark, cellPadding: { top: 6, bottom: 6, left: 8 } } },
      { content: `${symbol}${fmt(report.initialAmt)}`, styles: { halign: 'right', fontStyle: 'bold', textColor: C.dark, cellPadding: { top: 6, bottom: 6, right: 8 } } },
    ],
  ]

  // Other entries FIRST (before credit payments as user requested)
  if (otherEntriesTotal > 0) {
    rows.push([
      { content: '+ Otras Entradas', styles: { textColor: C.green, cellPadding: { top: 4, bottom: 4, left: 8 } } },
      { content: `+${symbol}${fmt(otherEntriesTotal)}`, styles: { halign: 'right', fontStyle: 'bold', textColor: C.green, cellPadding: { top: 4, bottom: 4, right: 8 } } },
    ])
  }

  if (report.totalSales > 0) {
    rows.push([
      { content: '+ Ventas en Efectivo', styles: { textColor: C.green, cellPadding: { top: 4, bottom: 4, left: 8 } } },
      { content: `+${symbol}${fmt(report.totalSales)}`, styles: { halign: 'right', fontStyle: 'bold', textColor: C.green, cellPadding: { top: 4, bottom: 4, right: 8 } } },
    ])
  }

  if (report.cashCreditPayments > 0) {
    rows.push([
      { content: '+ Cobros de Credito en Efectivo', styles: { textColor: [30, 120, 60], cellPadding: { top: 4, bottom: 4, left: 8 } } },
      { content: `+${symbol}${fmt(report.cashCreditPayments)}`, styles: { halign: 'right', fontStyle: 'bold', textColor: [30, 120, 60], cellPadding: { top: 4, bottom: 4, right: 8 } } },
    ])
  }

  if (ivaAmount > 0) {
    rows.push([
      { content: `+ I.V.A. Recaudado (${report.ivaRate}%)`, styles: { textColor: C.primaryLight, cellPadding: { top: 4, bottom: 4, left: 8 } } },
      { content: `+${symbol}${fmt(ivaAmount)}`, styles: { halign: 'right', fontStyle: 'bold', textColor: C.primaryLight, cellPadding: { top: 4, bottom: 4, right: 8 } } },
    ])
  }

  if (report.totalExpenses > 0) {
    rows.push([
      { content: '- Gastos', styles: { textColor: C.red, cellPadding: { top: 4, bottom: 4, left: 8 } } },
      { content: `-${symbol}${fmt(report.totalExpenses)}`, styles: { halign: 'right', fontStyle: 'bold', textColor: C.red, cellPadding: { top: 4, bottom: 4, right: 8 } } },
    ])
  }

  if (report.totalRetiros > 0) {
    rows.push([
      { content: '- Retiros de Excedente', styles: { textColor: C.red, cellPadding: { top: 4, bottom: 4, left: 8 } } },
      { content: `-${symbol}${fmt(report.totalRetiros)}`, styles: { halign: 'right', fontStyle: 'bold', textColor: C.red, cellPadding: { top: 4, bottom: 4, right: 8 } } },
    ])
  }

  // Separator line
  rows.push([
    { content: '', styles: { cellPadding: { top: 1, bottom: 1 } } },
    { content: '', styles: { cellPadding: { top: 1, bottom: 1 } } },
  ])

  // Total en Caja — the final result
  rows.push([
    { content: 'TOTAL EN CAJA', styles: { fontStyle: 'bold', textColor: C.white, cellPadding: { top: 8, bottom: 8, left: 8 } } },
    { content: `${symbol}${fmt(totalInCash)}`, styles: { halign: 'right', fontStyle: 'bold', textColor: C.white, fontSize: 12, cellPadding: { top: 8, bottom: 8, right: 8 } } },
  ])

  autoTable(doc, {
    startY: y,
    theme: 'plain',
    margin: { left: 36, right: 36 },
    body: rows,
    columnStyles: {
      0: { cellWidth: '70%' as any },
      1: { cellWidth: '30%' as any },
    },
    didParseCell: (data) => {
      if (data.section === 'body') {
        const rowIdx = data.row.index
        // Separator row
        if (rows[rowIdx][0].content === '') {
          data.cell.styles.cellPadding = { top: 0, bottom: 0, left: 0, right: 0 }
          data.cell.styles.lineWidth = 0.5
          data.cell.styles.lineColor = C.grayMedium
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(data.cell.styles as any).borders = { top: { width: 0.5, color: C.grayMedium }, bottom: { width: 0.5, color: C.grayMedium }, left: { width: 0 }, right: { width: 0 } }
        }
        // Total row — green highlight
        if (rowIdx === rows.length - 1) {
          data.cell.styles.fillColor = C.green
          data.cell.styles.textColor = C.white
        }
      }
    },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 8

  return y
}


/**
 * Recaudado total: combines direct sales + credit payments by method.
 */
function drawRecaudadoTotal(doc: jsPDF, report: CashCloseReport, startY: number): number {
  const symbol = cs(report.referenceCurrency)

  // Merge sales by method + credit payments by method
  const merged = new Map<string, { salesAmt: number; creditAmt: number; salesCount: number; creditCount: number }>()

  for (const s of report.salesByMethod) {
    const cur = merged.get(s.method) || { salesAmt: 0, creditAmt: 0, salesCount: 0, creditCount: 0 }
    cur.salesAmt += s.amount
    cur.salesCount += s.count
    merged.set(s.method, cur)
  }

  for (const c of report.creditPaymentsByMethod) {
    const cur = merged.get(c.method) || { salesAmt: 0, creditAmt: 0, salesCount: 0, creditCount: 0 }
    cur.creditAmt += c.amount
    cur.creditCount += c.count
    merged.set(c.method, cur)
  }

  if (merged.size === 0) return startY

  let y = startY

  // Section title with accent bar
  doc.setFillColor(...C.green)
  doc.rect(36, y, 4, 14, 'F')
  doc.setFontSize(12)
  doc.setTextColor(...C.green)
  doc.setFont('helvetica', 'bold')
  doc.text('Recaudado Total por Metodo', 46, y + 11)
  y += 18

  const hasCredit = report.creditPaymentsByMethod.length > 0
  const headers = hasCredit
    ? [['Metodo', 'Cant.', 'Ventas', 'Cobros Cred.', 'Total']]
    : [['Metodo', 'Cant.', 'Monto Total']]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bodyRows: any[] = Array.from(merged.entries()).map(([method, data]) => {
    const total = data.salesAmt + data.creditAmt
    const count = data.salesCount + data.creditCount
    const label = method.charAt(0).toUpperCase() + method.slice(1)
    if (hasCredit) {
      return [
        label,
        String(count),
        `${symbol}${fmt(data.salesAmt)}`,
        `${symbol}${fmt(data.creditAmt)}`,
        { content: `${symbol}${fmt(total)}`, styles: { fontStyle: 'bold' } },
      ]
    }
    return [
      label,
      String(count),
      { content: `${symbol}${fmt(total)}`, styles: { fontStyle: 'bold' } },
    ]
  })

  // Total row
  const totalSalesAmt = report.salesByMethod.reduce((s, m) => s + m.amount, 0)
  const totalCreditAmt = report.creditPaymentsByMethod.reduce((s, m) => s + m.amount, 0)
  const grandTotal = totalSalesAmt + totalCreditAmt
  const totalCount = report.salesByMethod.reduce((s, m) => s + m.count, 0) + report.creditPaymentsByMethod.reduce((s, m) => s + m.count, 0)

  if (hasCredit) {
    bodyRows.push([
      { content: 'TOTAL', styles: { fontStyle: 'bold' } },
      { content: String(totalCount), styles: { fontStyle: 'bold' } },
      { content: `${symbol}${fmt(totalSalesAmt)}`, styles: { fontStyle: 'bold' } },
      { content: `${symbol}${fmt(totalCreditAmt)}`, styles: { fontStyle: 'bold' } },
      { content: `${symbol}${fmt(grandTotal)}`, styles: { fontStyle: 'bold', textColor: C.green } },
    ])
  } else {
    bodyRows.push([
      { content: 'TOTAL', styles: { fontStyle: 'bold' } },
      { content: String(totalCount), styles: { fontStyle: 'bold' } },
      { content: `${symbol}${fmt(grandTotal)}`, styles: { fontStyle: 'bold', textColor: C.green } },
    ])
  }

  autoTable(doc, {
    startY: y,
    theme: 'grid',
    margin: { left: 36, right: 36 },
    head: headers,
    body: bodyRows,
    styles: {
      fontSize: 9,
      cellPadding: 4,
    },
    headStyles: {
      fillColor: [22, 101, 52],
      textColor: C.white,
      fontStyle: 'bold',
      fontSize: 8,
    },
    columnStyles: hasCredit
      ? {
          0: { fontStyle: 'normal' },
          1: { halign: 'center', cellWidth: 30 },
          2: { halign: 'right' },
          3: { halign: 'right' },
          4: { halign: 'right', textColor: C.primary },
        }
      : {
          0: { fontStyle: 'normal' },
          1: { halign: 'center', cellWidth: 30 },
          2: { halign: 'right', textColor: C.primary },
        },
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index === bodyRows.length - 1) {
        data.cell.styles.fillColor = C.greenSoft
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.textColor = C.green
      }
    },
  })

  // Total recaudado badge
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 8
  const pw = doc.internal.pageSize.getWidth()

  doc.setFillColor(...C.green)
  doc.roundedRect(pw - 36 - 180, y, 180, 26, 4, 4, 'F')
  doc.setFontSize(8)
  doc.setTextColor(200, 240, 210)
  doc.setFont('helvetica', 'normal')
  doc.text('TOTAL RECAUDADO', pw - 36 - 90, y + 9, { align: 'center' })
  doc.setFontSize(13)
  doc.setTextColor(...C.white)
  doc.setFont('helvetica', 'bold')
  doc.text(`${symbol}${fmt(grandTotal)}`, pw - 36 - 90, y + 21, { align: 'center' })

  return y + 36
}

function drawExpenses(doc: jsPDF, report: CashCloseReport, startY: number, type: 'salida' | 'entrada'): number {
  const items = type === 'salida' ? report.expenses : report.otherEntries
  const symbol = cs(report.referenceCurrency)
  const title = type === 'salida' ? 'Gastos y Salidas' : 'Otras Entradas'
  const color = type === 'salida' ? C.red : C.green
  const prefix = type === 'salida' ? '-' : '+'

  if (items.length === 0) return startY

  let y = startY

  // Section title with accent bar
  const accentColor = type === 'salida' ? C.red : C.green
  doc.setFillColor(...accentColor)
  doc.rect(36, y, 4, 14, 'F')
  doc.setFontSize(12)
  doc.setTextColor(...accentColor)
  doc.setFont('helvetica', 'bold')
  doc.text(title, 46, y + 11)
  y += 18

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bodyRows: any[] = items.map(exp => [
    exp.concept,
    fmtDateShort(exp.date),
    `${prefix}${symbol}${fmt(exp.amount)}`,
  ])

  const total = items.reduce((s, e) => s + e.amount, 0)
  bodyRows.push([
    { content: 'TOTAL', styles: { fontStyle: 'bold' } },
    { content: '', styles: {} },
    { content: `${prefix}${symbol}${fmt(total)}`, styles: { fontStyle: 'bold', textColor: color } },
  ])

  autoTable(doc, {
    startY: y,
    theme: 'grid',
    margin: { left: 36, right: 36 },
    head: [['Concepto', 'Fecha', 'Monto']],
    body: bodyRows,
    styles: {
      fontSize: 8,
      cellPadding: 3,
    },
    headStyles: {
      fillColor: type === 'salida' ? [153, 27, 27] : [21, 128, 61],
      textColor: C.white,
      fontStyle: 'bold',
      fontSize: 8,
    },
    columnStyles: {
      0: { fontStyle: 'normal', textColor: C.dark },
      1: { halign: 'right', textColor: C.gray, fontSize: 7 },
      2: { halign: 'right', fontStyle: 'bold', textColor: color },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index === bodyRows.length - 1) {
        data.cell.styles.fillColor = type === 'salida' ? C.redSoft : C.greenSoft
        data.cell.styles.fontStyle = 'bold'
      }
    },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (doc as any).lastAutoTable.finalY + 8
}

function drawSalesDetail(doc: jsPDF, report: CashCloseReport, startY: number): number {
  if (report.sales.length === 0) return startY

  const symbol = cs(report.referenceCurrency)
  let y = startY

  // Section title with accent bar
  doc.setFillColor(...C.primary)
  doc.rect(36, y, 4, 14, 'F')
  doc.setFontSize(12)
  doc.setTextColor(...C.primary)
  doc.setFont('helvetica', 'bold')
  doc.text(`Detalle de Ventas (${report.sales.length})`, 46, y + 11)
  y += 18

  for (let si = 0; si < report.sales.length; si++) {
    const sale = report.sales[si]

    // Sale header bar
    doc.setFillColor(...C.primarySoft)
    doc.roundedRect(36, y, doc.internal.pageSize.getWidth() - 72, 18, 2, 2, 'F')
    doc.setDrawColor(...C.primaryLight)
    doc.setLineWidth(0.3)
    doc.roundedRect(36, y, doc.internal.pageSize.getWidth() - 72, 18, 2, 2, 'S')

    doc.setFontSize(8)
    doc.setTextColor(...C.primary)
    doc.setFont('helvetica', 'bold')
    doc.text(
      `#${si + 1}  |  ${fmtDateShort(sale.date)}  |  ${sale.clientName || 'General'}`,
      44, y + 12
    )
    y += 22

    const linesBody = sale.lines.map(l => [
      l.productName,
      String(l.quantity),
      `${symbol}${fmt(l.unitPrice)}`,
      `${symbol}${fmt(l.lineTotal)}`,
    ])

    linesBody.push(['', '', 'TOTAL:', `${symbol}${fmt(sale.total)}`])

    autoTable(doc, {
      startY: y,
      theme: 'grid',
      margin: { left: 36, right: 36 },
      head: [['Producto', 'Cant.', 'P. Unit.', 'Total']],
      body: linesBody,
      styles: {
        fontSize: 7.5,
        cellPadding: 2.5,
        overflow: 'linebreak',
      },
      headStyles: {
        fillColor: C.grayLight,
        textColor: C.gray,
        fontStyle: 'bold',
        fontSize: 7,
      },
      columnStyles: {
        0: { textColor: C.dark, cellWidth: 'auto', overflow: 'linebreak' },
        1: { halign: 'center', cellWidth: 22 },
        2: { halign: 'right', cellWidth: 38 },
        3: { halign: 'right', fontStyle: 'bold', textColor: C.primary },
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.row.index === linesBody.length - 1) {
          data.cell.styles.fillColor = C.blueBg
          data.cell.styles.fontStyle = 'bold'
        }
      },
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 6

    // Payment methods for this sale
    if (sale.payments.length > 0) {
      doc.setFillColor(...C.greenSoft)
      doc.roundedRect(42, y - 2, doc.internal.pageSize.getWidth() - 84, 14, 2, 2, 'F')
      doc.setFontSize(7)
      doc.setTextColor(...C.green)
      doc.setFont('helvetica', 'bold')
      doc.text('Pago: ', 48, y + 7)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(C.dark[0], C.dark[1], C.dark[2])
      const payStr = sale.payments.map(p =>
        `${p.method.charAt(0).toUpperCase() + p.method.slice(1)} ${symbol}${fmt(p.amount)}${p.reference ? ` (Ref: ${p.reference})` : ''}`
      ).join('  |  ')
      const payLabelW = doc.getTextWidth('Pago: ')
      doc.text(payStr, 48 + payLabelW, y + 7, { maxWidth: doc.internal.pageSize.getWidth() - 100 })
      y += 18
    }

    y += 4
  }

  return y
}

function drawFooter(doc: jsPDF, totalPages: number, info: { businessName: string; businessRif: string; businessEmail: string; businessPhone: string }) {
  const pw = doc.internal.pageSize.getWidth()
  const ph = doc.internal.pageSize.getHeight()

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    // Top thin line
    doc.setDrawColor(...C.grayMedium)
    doc.setLineWidth(0.3)
    doc.line(36, ph - 44, pw - 36, ph - 44)

    doc.setFontSize(7)
    doc.setTextColor(...C.gray)
    doc.setFont('helvetica', 'normal')

    const businessLine = `${info.businessName}${info.businessRif ? `  |  RIF: ${info.businessRif}` : ''}`
    doc.text(businessLine, pw / 2, ph - 34, { align: 'center' })

    const contactLine = [
      info.businessEmail,
      info.businessPhone,
    ].filter(Boolean).join('  |  ')
    if (contactLine) {
      doc.text(contactLine, pw / 2, ph - 25, { align: 'center' })
    }

    doc.text('Generado por JO-Administrativo', pw / 2, ph - 16, { align: 'center' })

    if (totalPages > 1) {
      doc.text(`Pagina ${i} de ${totalPages}`, pw / 2, ph - 8, { align: 'center' })
    }
  }
}

// ─── PDF Generator ────────────────────────────────────────────────────────────

export async function generateCashClosePDF(report: CashCloseReport): Promise<Buffer> {
  const appTz = await fetchAppTz()
  _tz = appTz.timezone
  _locale = appTz.locale

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'letter',
  })

  doc.setProperties({
    title: `Cierre de Caja - ${report.registerName || 'Sin nombre'} - ${fmtDateShort(report.closingDate)}`,
    author: report.businessName,
    subject: 'Reporte de cierre de caja',
  })

  // Header with logo
  let y = await drawHeader(doc, report)

  // Info card
  y = drawInfoCard(doc, report, y)

  // Cash summary (efectivo en caja)
  y = drawCashSummary(doc, report, y)

  // Recaudado total by method
  y = drawRecaudadoTotal(doc, report, y)

  // Expenses
  y = drawExpenses(doc, report, y, 'salida')

  // Other entries (not credit payments)
  y = drawExpenses(doc, report, y, 'entrada')

  // Sales detail
  y = drawSalesDetail(doc, report, y)

  // Footer
  const totalPages = doc.getNumberOfPages()
  drawFooter(doc, totalPages, {
    businessName: report.businessName,
    businessRif: report.businessRif,
    businessEmail: report.businessEmail,
    businessPhone: report.businessPhone,
  })

  return Buffer.from(doc.output('arraybuffer'))
}

// ─── Multi-register PDF (for close-all) ───────────────────────────────────────

export async function generateMultiCashClosePDF(reports: CashCloseReport[]): Promise<Buffer> {
  if (reports.length === 1) {
    return generateCashClosePDF(reports[0])
  }

  const appTz = await fetchAppTz()
  _tz = appTz.timezone
  _locale = appTz.locale

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'letter',
  })

  doc.setProperties({
    title: `Cierre Masivo de Cajas - ${fmtDateShort(new Date())}`,
    author: reports[0]?.businessName || 'JO-Administrativo',
    subject: 'Reporte de cierre masivo de cajas',
  })

  const info = reports[0]
  const symbol = cs(info?.referenceCurrency || 'USD')
  const pw = doc.internal.pageSize.getWidth()

  // ─── Cover page ──────────────────────────────────────────────────────────
  // Header
  doc.setFillColor(...C.primaryLight)
  doc.rect(0, 0, pw, 3, 'F')
  doc.setFillColor(...C.primary)
  doc.rect(0, 3, pw, 56, 'F')

  let logoDrawn = false
  if (info?.logoUrl) {
    try {
      const logoRes = await fetch(info.logoUrl)
      if (logoRes.ok) {
        const logoBuf = Buffer.from(await logoRes.arrayBuffer())
        const base64 = `data:image/png;base64,${logoBuf.toString('base64')}`
        doc.addImage(base64, 'PNG', 36, 10, 40, 40)
        logoDrawn = true
      }
    } catch { /* skip */ }
  }

  const coverTextX = logoDrawn ? 88 : 36
  doc.setFontSize(16)
  doc.setTextColor(...C.white)
  doc.setFont('helvetica', 'bold')
  doc.text('Cierre Masivo de Cajas', coverTextX, 30)
  doc.setFontSize(9)
  doc.setTextColor(180, 195, 230)
  doc.setFont('helvetica', 'normal')
  doc.text(`${reports.length} caja(s) cerradas  |  ${fmtDate(new Date())}`, coverTextX, 44)

  // Summary table
  let y = 72

  const headers = [['Cajero/a', 'Caja', 'Recaudado', 'En Caja']]

  let grandTotalRecaudado = 0
  let grandTotalEnCaja = 0

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bodyRows: any[] = reports.map(r => {
    const recaudado = r.totalCollected
    const otherTotal = r.otherEntries.reduce((s: number, e: { amount: number }) => s + e.amount, 0)
    let ivaAmt = 0
    if (r.ivaEnabled && r.ivaRate > 0) {
      ivaAmt = Math.round((r.totalSales + r.cashCreditPayments) * (r.ivaRate / 100) * 100) / 100
    }
    const enCaja = Math.round((r.initialAmt + otherTotal + r.totalSales + r.cashCreditPayments + ivaAmt - r.totalExpenses - r.totalRetiros) * 100) / 100
    grandTotalRecaudado += recaudado
    grandTotalEnCaja += enCaja
    return [
      r.cashierName,
      r.registerName || '\u2014',
      `${symbol}${fmt(recaudado)}`,
      `${symbol}${fmt(enCaja)}`,
    ]
  })

  bodyRows.push([
    { content: 'TOTAL GENERAL', styles: { fontStyle: 'bold' } },
    { content: '', styles: {} },
    { content: `${symbol}${fmt(grandTotalRecaudado)}`, styles: { fontStyle: 'bold', textColor: C.green } },
    { content: `${symbol}${fmt(grandTotalEnCaja)}`, styles: { fontStyle: 'bold', textColor: C.green } },
  ])

  autoTable(doc, {
    startY: y,
    theme: 'grid',
    margin: { left: 36, right: 36 },
    head: headers,
    body: bodyRows,
    styles: {
      fontSize: 9,
      cellPadding: 4,
    },
    headStyles: {
      fillColor: C.primary,
      textColor: C.white,
      fontStyle: 'bold',
    },
    columnStyles: {
      2: { halign: 'right' },
      3: { halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index === bodyRows.length - 1) {
        data.cell.styles.fillColor = C.blueBg
        data.cell.styles.fontStyle = 'bold'
      }
    },
  })

  // ─── Individual reports ──────────────────────────────────────────────────
  for (let i = 0; i < reports.length; i++) {
    doc.addPage()
    const r = reports[i]

    // Compact header
    doc.setFillColor(...C.primaryLight)
    doc.rect(0, 0, pw, 2, 'F')
    doc.setFillColor(...C.primary)
    doc.rect(0, 2, pw, 30, 'F')

    let headerLogoDrawn = false
    if (r.logoUrl) {
      try {
        const logoRes = await fetch(r.logoUrl)
        if (logoRes.ok) {
          const logoBuf = Buffer.from(await logoRes.arrayBuffer())
          const base64 = `data:image/png;base64,${logoBuf.toString('base64')}`
          doc.addImage(base64, 'PNG', 36, 5, 22, 22)
          headerLogoDrawn = true
        }
      } catch { /* skip */ }
    }

    const htx = headerLogoDrawn ? 66 : 36
    doc.setFontSize(11)
    doc.setTextColor(...C.white)
    doc.setFont('helvetica', 'bold')
    doc.text(`Caja ${i + 1}: ${r.registerName || 'Sin nombre'}`, htx, 21)

    // Financial summary compact
    const sym = cs(r.referenceCurrency)
    y = 42

    doc.setFillColor(...C.primary)
    doc.rect(36, y, 4, 12, 'F')
    doc.setFontSize(10)
    doc.setTextColor(...C.primary)
    doc.setFont('helvetica', 'bold')
    doc.text('Resumen de Efectivo', 46, y + 10)
    y += 16

    const otherEntriesTotal = r.otherEntries.reduce((s: number, e: { amount: number }) => s + e.amount, 0)
    let ivaAmt = 0
    if (r.ivaEnabled && r.ivaRate > 0) {
      ivaAmt = Math.round((r.totalSales + r.cashCreditPayments) * (r.ivaRate / 100) * 100) / 100
    }
    const totalInCash = Math.round((r.initialAmt + otherEntriesTotal + r.totalSales + r.cashCreditPayments + ivaAmt - r.totalExpenses - r.totalRetiros) * 100) / 100

    const summaryBody: any[][] = [
      [
        { content: 'Monto de Apertura', styles: { textColor: C.dark, cellPadding: { top: 5, bottom: 5, left: 6 } } },
        { content: `${sym}${fmt(r.initialAmt)}`, styles: { halign: 'right', fontStyle: 'bold', textColor: C.dark, cellPadding: { top: 5, bottom: 5, right: 6 } } },
      ],
    ]
    if (otherEntriesTotal > 0) {
      summaryBody.push([
        { content: '+ Otras Entradas', styles: { textColor: C.green, cellPadding: { top: 3, bottom: 3, left: 6 } } },
        { content: `+${sym}${fmt(otherEntriesTotal)}`, styles: { halign: 'right', fontStyle: 'bold', textColor: C.green, cellPadding: { top: 3, bottom: 3, right: 6 } } },
      ])
    }
    if (r.totalSales > 0) {
      summaryBody.push([
        { content: '+ Ventas en Efectivo', styles: { textColor: C.green, cellPadding: { top: 3, bottom: 3, left: 6 } } },
        { content: `+${sym}${fmt(r.totalSales)}`, styles: { halign: 'right', fontStyle: 'bold', textColor: C.green, cellPadding: { top: 3, bottom: 3, right: 6 } } },
      ])
    }
    if (r.cashCreditPayments > 0) {
      summaryBody.push([
        { content: '+ Cobros de Credito en Efectivo', styles: { textColor: [30, 120, 60], cellPadding: { top: 3, bottom: 3, left: 6 } } },
        { content: `+${sym}${fmt(r.cashCreditPayments)}`, styles: { halign: 'right', fontStyle: 'bold', textColor: [30, 120, 60], cellPadding: { top: 3, bottom: 3, right: 6 } } },
      ])
    }
    if (ivaAmt > 0) {
      summaryBody.push([
        { content: `+ I.V.A. (${r.ivaRate}%)`, styles: { textColor: C.primaryLight, cellPadding: { top: 3, bottom: 3, left: 6 } } },
        { content: `+${sym}${fmt(ivaAmt)}`, styles: { halign: 'right', fontStyle: 'bold', textColor: C.primaryLight, cellPadding: { top: 3, bottom: 3, right: 6 } } },
      ])
    }
    if (r.totalExpenses > 0) {
      summaryBody.push([
        { content: '- Gastos', styles: { textColor: C.red, cellPadding: { top: 3, bottom: 3, left: 6 } } },
        { content: `-${sym}${fmt(r.totalExpenses)}`, styles: { halign: 'right', fontStyle: 'bold', textColor: C.red, cellPadding: { top: 3, bottom: 3, right: 6 } } },
      ])
    }
    if (r.totalRetiros > 0) {
      summaryBody.push([
        { content: '- Retiros', styles: { textColor: C.red, cellPadding: { top: 3, bottom: 3, left: 6 } } },
        { content: `-${sym}${fmt(r.totalRetiros)}`, styles: { halign: 'right', fontStyle: 'bold', textColor: C.red, cellPadding: { top: 3, bottom: 3, right: 6 } } },
      ])
    }

    summaryBody.push([
      { content: '', styles: { cellPadding: { top: 1, bottom: 1 } } },
      { content: '', styles: { cellPadding: { top: 1, bottom: 1 } } },
    ])
    summaryBody.push([
      { content: 'TOTAL EN CAJA', styles: { fontStyle: 'bold', textColor: C.white, cellPadding: { top: 6, bottom: 6, left: 6 } } },
      { content: `${sym}${fmt(totalInCash)}`, styles: { halign: 'right', fontStyle: 'bold', textColor: C.white, fontSize: 10, cellPadding: { top: 6, bottom: 6, right: 6 } } },
    ])

    autoTable(doc, {
      startY: y,
      theme: 'plain',
      margin: { left: 36, right: 36 },
      body: summaryBody,
      columnStyles: {
        0: { cellWidth: '70%' as any },
        1: { cellWidth: '30%' as any },
      },
      didParseCell: (data) => {
        if (data.section === 'body') {
          const rowIdx = data.row.index
          if (summaryBody[rowIdx][0].content === '') {
            data.cell.styles.cellPadding = { top: 0, bottom: 0, left: 0, right: 0 }
            data.cell.styles.lineWidth = 0.5
            data.cell.styles.lineColor = C.grayMedium
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(data.cell.styles as any).borders = { top: { width: 0.5, color: C.grayMedium }, bottom: { width: 0.5, color: C.grayMedium }, left: { width: 0 }, right: { width: 0 } }
          }
          if (rowIdx === summaryBody.length - 1) {
            data.cell.styles.fillColor = C.green
            data.cell.styles.textColor = C.white
          }
        }
      },
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 6

    // Recaudado total
    y = drawRecaudadoTotal(doc, r, y)

    // Sales detail
    y = drawSalesDetail(doc, r, y)
  }

  // Footer
  const totalPages = doc.getNumberOfPages()
  drawFooter(doc, totalPages, { businessName: info.businessName, businessRif: info.businessRif, businessEmail: info.businessEmail || '', businessPhone: info.businessPhone || '' })

  return Buffer.from(doc.output('arraybuffer'))
}

// ─── Data builder ─────────────────────────────────────────────────────────────

export interface RegisterWithDetails {
  id: string
  name: string | null
  userId: string
  branchId: string
  openingDate: Date
  closingDate: Date
  initialAmt: number
  currentAmt: number
  status: string
  user: { id: string; name: string; email: string }
  branch: { id: string; name: string }
  sales: {
    id: string
    date: Date
    total: number
    status: string
    clientId: string | null
    client?: { id: string; name: string; lastName?: string } | null
    payments: {
      id: string
      method: string
      amount: number
      currencyId: string
      reference: string | null
      currency: { id: string; code: string; name: string }
    }[]
    lines: {
      id: string
      quantity: number
      unitPrice: number
      unitCost: number
      lineTotal: number
      lineProfit: number
      product: { id: string; name: string } | null
    }[]
  }[]
  movements: {
    id: string
    type: string
    amount: number
    concept: string
    createdAt: Date
  }[]
}

export async function buildReportFromRegister(
  register: RegisterWithDetails,
  closingDate: Date,
  actual: number,
  expected: number,
  difference: number,
  totalSales: number,
  totalExpenses: number,
  totalEntries: number,
  totalRetiros: number,
  businessName: string,
  businessRif: string,
  businessAddress: string,
  businessPhone: string,
  exchangeRate: number,
  referenceCurrency: string,
  ivaEnabled: boolean,
  ivaRate: number,
): Promise<CashCloseReport> {
  const pmList = await getPaymentMethodsFromDB().catch(() => FALLBACK_METHODS)
  const creditCodes = new Set(pmList.filter(m => m.isCredit).map(m => m.code))
  const cashCodes = new Set(pmList.filter(m => m.isCash).map(m => m.code))

  // ── 1. Sales (exclude credit-only sales) ──
  const sales: SaleDetail[] = register.sales
    .filter(s => !s.payments.some(p => creditCodes.has(p.method)))
    .map(s => {
      const mappedLines = s.lines.length > 0
        ? s.lines.map(l => ({
            productName: l.product?.name || 'Producto eliminado',
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            lineTotal: l.lineTotal,
          }))
        : [{ productName: 'Suscripcion / Renovacion de plan', quantity: 1, unitPrice: s.total, lineTotal: s.total }]
      const clientName = s.client
        ? [s.client.name, (s.client as any).lastName].filter(Boolean).join(' ') || null
        : null
      return {
        id: s.id,
        date: s.date,
        clientName,
        total: s.total,
        lines: mappedLines,
        payments: s.payments.map(p => ({
          method: p.method,
          amount: p.amount,
          currencyCode: p.currency.code,
          reference: p.reference,
        })),
      }
    })

  // ── 2. Sales by method (from direct sales, no credit) ──
  const salesByMethod: MethodBreakdown[] = []
  const salesMethodMap = new Map<string, { amount: number; count: number }>()
  for (const sale of sales) {
    for (const p of sale.payments) {
      const cur = salesMethodMap.get(p.method) || { amount: 0, count: 0 }
      cur.amount += p.amount
      cur.count++
      salesMethodMap.set(p.method, cur)
    }
  }
  for (const [method, data] of salesMethodMap) {
    salesByMethod.push({ method, ...data })
  }

  // ── 3. Credit payments from movements ──
  const creditPaymentsByMethod: MethodBreakdown[] = []
  const creditMethodMap = new Map<string, { amount: number; count: number }>()
  let cashCreditPayments = 0

  for (const m of register.movements) {
    if (m.type !== 'entrada' || !m.concept.startsWith('Cobro credito:')) continue

    // Extract method name from concept: "Cobro credito: Client Name (Method Name)"
    const match = m.concept.match(/\((.+?)\)\s*$/)
    if (!match) continue
    const methodName = match[1].trim()

    // Find if this method is cash
    const pm = pmList.find(p => p.name === methodName)
    const isCash = pm ? pm.isCash : false

    // Use the method code for grouping
    const methodCode = pm?.code || methodName.toLowerCase()

    const cur = creditMethodMap.get(methodCode) || { amount: 0, count: 0 }
    cur.amount += m.amount
    cur.count++
    creditMethodMap.set(methodCode, cur)

    if (isCash) {
      cashCreditPayments += m.amount
    }
  }

  for (const [method, data] of creditMethodMap) {
    creditPaymentsByMethod.push({ method, ...data })
  }

  // ── 4. Other entries (movements that are NOT credit payments) ──
  const otherEntries = register.movements
    .filter(m => m.type === 'entrada' && !m.concept.startsWith('Cobro credito:'))
    .map(m => ({ concept: m.concept, amount: m.amount, date: m.createdAt }))

  // ── 5. Expenses (salida movements) ──
  const expenses = register.movements
    .filter(m => m.type === 'salida')
    .map(m => ({ concept: m.concept, amount: m.amount, date: m.createdAt }))

  // ── 6. Total collected (all non-credit money received) ──
  const totalFromSales = sales.reduce((sum, s) => sum + s.total, 0)
  const totalFromCredit = creditPaymentsByMethod.reduce((sum, c) => sum + c.amount, 0)
  const totalCollected = Math.round((totalFromSales + totalFromCredit) * 100) / 100

  // ── 7. Get business email and logo ──
  let businessEmail = ''
  let logoUrl = ''
  try {
    const { db } = await import('./db')
    const settings = await db.settings.findFirst({ select: { email: true, logoUrl: true } })
    if (settings) {
      businessEmail = settings.email || ''
      logoUrl = settings.logoUrl || ''
    }
  } catch { /* skip */ }

  return {
    businessName,
    businessRif,
    businessAddress,
    businessPhone,
    businessEmail,
    logoUrl,
    registerId: register.id,
    registerName: register.name,
    branchName: register.branch.name,
    cashierName: register.user.name,
    openingDate: register.openingDate,
    closingDate,
    initialAmt: register.initialAmt,
    totalSales,
    totalExpenses,
    totalEntries,
    totalRetiros,
    expected,
    actual,
    difference,
    sales,
    expenses,
    entries: otherEntries, // legacy compatibility, now = otherEntries
    exchangeRate,
    referenceCurrency,
    ivaEnabled,
    ivaRate,
    cashCreditPayments,
    otherEntries,
    creditPaymentsByMethod,
    totalCollected,
    salesByMethod,
  }
}