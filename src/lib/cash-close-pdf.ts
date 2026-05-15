import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Prisma } from '@prisma/client'

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

export interface CashCloseReport {
  businessName: string
  businessRif: string
  businessAddress: string
  businessPhone: string
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
}

// ─── Colors ───────────────────────────────────────────────────────────────────

const C = {
  primary: [30, 64, 175] as [number, number, number],
  primaryLight: [59, 130, 246] as [number, number, number],
  green: [22, 163, 74] as [number, number, number],
  red: [220, 38, 38] as [number, number, number],
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
  return d.toLocaleString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function fmtDateShort(d: Date): string {
  return d.toLocaleString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function cs(refCurrency: string): string {
  return refCurrency === 'EUR' ? '\u20ac' : '$'
}

// ─── Drawing helpers ──────────────────────────────────────────────────────────

function drawHeader(doc: jsPDF, report: CashCloseReport) {
  const pw = doc.internal.pageSize.getWidth()

  // Blue header band
  doc.setFillColor(...C.primary)
  doc.rect(0, 0, pw, 80, 'F')

  doc.setFontSize(18)
  doc.setTextColor(...C.white)
  doc.setFont('helvetica', 'bold')
  doc.text(report.businessName, 45, 32)

  doc.setFontSize(9)
  doc.setTextColor(209, 213, 219)
  doc.setFont('helvetica', 'normal')
  const infoLine = `RIF: ${report.businessRif}  |  ${report.businessAddress}  |  Tel: ${report.businessPhone}`
  doc.text(infoLine, 45, 46)

  doc.setFontSize(10)
  doc.setTextColor(...C.white)
  doc.setFont('helvetica', 'bold')
  doc.text('REPORTE DE CIERRE DE CAJA', pw - 45, 72, { align: 'right' })
}

function drawRegisterInfo(doc: jsPDF, report: CashCloseReport): number {
  const pw = doc.internal.pageSize.getWidth()
  const usableW = pw - 90
  let y = 90

  // Info box background
  doc.setFillColor(240, 245, 255)
  doc.setDrawColor(...C.primaryLight)
  doc.roundedRect(45, y, usableW, 68, 3, 3, 'FD')

  doc.setFontSize(10)
  doc.setTextColor(...C.primary)
  doc.setFont('helvetica', 'bold')
  doc.text('Informacion de la Caja', 55, y + 12)

  doc.setFontSize(9)
  doc.setTextColor(...C.dark)
  doc.setFont('helvetica', 'normal')

  const x1 = 55
  const x2 = 45 + usableW / 2
  doc.text(`Sucursal: ${report.branchName}`, x1, y + 28)
  doc.text(`Cajero/a: ${report.cashierName}`, x2, y + 28)
  doc.text(`Caja: ${report.registerName || 'Sin nombre'}`, x1, y + 42)
  doc.text(`ID: ${report.registerId.slice(0, 8)}...`, x2, y + 42)
  doc.text(`Apertura: ${fmtDate(report.openingDate)}`, x1, y + 56)
  doc.text(`Cierre: ${fmtDate(report.closingDate)}`, x2, y + 56)

  return y + 76
}

function drawFinancialSummary(doc: jsPDF, report: CashCloseReport, startY: number): number {
  const pw = doc.internal.pageSize.getWidth()
  const symbol = cs(report.referenceCurrency)
  let y = startY

  doc.setFontSize(11)
  doc.setTextColor(...C.primary)
  doc.setFont('helvetica', 'bold')
  doc.text('Resumen Financiero', 45, y)
  y += 6

  // Summary table
  // Build summary body rows
  const summaryBody: string[][] = [
    ['Monto de Apertura', `${symbol}${fmt(report.initialAmt)}`],
    ['+ Ventas en Efectivo', `${symbol}${fmt(report.totalSales)}`],
    ['+ Entradas de Efectivo', `${symbol}${fmt(report.totalEntries)}`],
    ['- Gastos / Salidas', `${symbol}${fmt(report.totalExpenses)}`],
    ['- Retiros de Excedente', `${symbol}${fmt(report.totalRetiros)}`],
  ]

  // Add IVA row if enabled
  if (report.ivaEnabled && report.ivaRate > 0) {
    const ivaCollected = report.totalSales * (report.ivaRate / 100)
    summaryBody.push([`+ I.V.A. Recaudado (${report.ivaRate}%)`, `${symbol}${fmt(ivaCollected)}`])
  }

  autoTable(doc, {
    startY: y,
    theme: 'plain',
    margin: { left: 45, right: 45 },
    body: summaryBody,
    styles: {
      fontSize: 9,
      cellPadding: 4,
    },
    columnStyles: {
      0: { fontStyle: 'normal', textColor: C.dark },
      1: { fontStyle: 'bold', halign: 'right', textColor: C.dark },
    },
    didParseCell: (data) => {
      // Color green for income rows, red for expense rows
      if (data.section === 'body') {
        if (data.row.index === 1 || data.row.index === 2) {
          data.cell.styles.textColor = C.green
        } else if (data.row.index === 3 || data.row.index === 4) {
          data.cell.styles.textColor = C.red
        }
      }
    },
    didDrawCell: (data) => {
      if (data.section === 'body') {
        doc.setFillColor(...C.grayLight)
        doc.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height, 'F')
      }
    },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 4

  // Divider
  const pw2 = doc.internal.pageSize.getWidth()
  doc.setDrawColor(...C.primary)
  doc.setLineWidth(1.5)
  doc.line(45, y, pw2 - 45, y)
  y += 6

  // Result rows
  autoTable(doc, {
    startY: y,
    theme: 'plain',
    margin: { left: 45, right: 45 },
    body: [
      ['Monto Esperado', `${symbol}${fmt(report.expected)}`],
      ['Monto Real (Contado)', `${symbol}${fmt(report.actual)}`],
      ['Diferencia', `${symbol}${fmt(report.difference)}`],
    ],
    styles: {
      fontSize: 9,
      cellPadding: 4,
    },
    columnStyles: {
      0: { fontStyle: 'normal', textColor: C.dark },
      1: { fontStyle: 'bold', halign: 'right' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 1 && data.row.index === 2) {
        data.cell.styles.textColor = report.difference === 0 ? C.green : report.difference > 0 ? C.amber : C.red
      }
    },
    didDrawCell: (data) => {
      if (data.section === 'body') {
        doc.setFillColor(...C.yellowBg)
        doc.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height, 'F')
      }
    },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 8

  // Exchange rate info
  if (report.exchangeRate > 0) {
    const totalBs = report.expected * report.exchangeRate
    const pw3 = doc.internal.pageSize.getWidth()
    doc.setFontSize(8)
    doc.setTextColor(...C.gray)
    doc.setFont('helvetica', 'normal')
    doc.text(
      `Tasa de cambio: 1 ${report.referenceCurrency} = ${fmt(report.exchangeRate)} Bs  |  Total esperado en Bs: ${fmt(totalBs)} Bs`,
      pw3 / 2, y, { align: 'center' }
    )
    y += 12
  }

  return y
}

function drawPaymentMethods(doc: jsPDF, report: CashCloseReport, startY: number): number {
  const symbol = cs(report.referenceCurrency)
  const paymentMap = new Map<string, { amount: number; count: number }>()
  let totalAllPayments = 0

  for (const sale of report.sales) {
    for (const p of sale.payments) {
      const key = p.method
      const current = paymentMap.get(key) || { amount: 0, count: 0 }
      current.amount += p.amount
      current.count++
      paymentMap.set(key, current)
      totalAllPayments += p.amount
    }
  }

  if (paymentMap.size === 0) return startY

  let y = startY

  doc.setFontSize(11)
  doc.setTextColor(...C.primary)
  doc.setFont('helvetica', 'bold')
  doc.text('Desglose por Metodo de Pago', 45, y)
  y += 4

  const bodyRows = Array.from(paymentMap.entries()).map(([method, data]) => [
    method.charAt(0).toUpperCase() + method.slice(1),
    String(data.count),
    `${symbol}${fmt(data.amount)}`,
  ])

  bodyRows.push(['TOTAL', String(bodyRows.reduce((s, r) => s + parseInt(r[1]), 0)), `${symbol}${fmt(totalAllPayments)}`])

  autoTable(doc, {
    startY: y,
    theme: 'grid',
    margin: { left: 45, right: 45 },
    head: [['Metodo', 'Cantidad', 'Monto Total']],
    body: bodyRows,
    styles: {
      fontSize: 9,
      cellPadding: 3,
    },
    headStyles: {
      fillColor: C.primary,
      textColor: C.white,
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { fontStyle: 'normal' },
      1: { halign: 'center' },
      2: { halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index === bodyRows.length - 1) {
        data.cell.styles.fillColor = C.blueBg
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.textColor = C.primary
      }
    },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (doc as any).lastAutoTable.finalY + 8
}

function drawExpenses(doc: jsPDF, report: CashCloseReport, startY: number, type: 'salida' | 'entrada'): number {
  const items = type === 'salida' ? report.expenses : report.entries
  const symbol = cs(report.referenceCurrency)
  const title = type === 'salida' ? 'Gastos y Salidas' : 'Entradas de Efectivo'
  const color = type === 'salida' ? C.red : C.green
  const prefix = type === 'salida' ? '-' : '+'

  if (items.length === 0) return startY

  let y = startY

  doc.setFontSize(11)
  doc.setTextColor(...color)
  doc.setFont('helvetica', 'bold')
  doc.text(title, 45, y)
  y += 4

  const bodyRows = items.map(exp => [
    exp.concept,
    fmtDateShort(exp.date),
    `${prefix}${symbol}${fmt(exp.amount)}`,
  ])

  autoTable(doc, {
    startY: y,
    theme: 'grid',
    margin: { left: 45, right: 45 },
    head: [['Concepto', 'Fecha', 'Monto']],
    body: bodyRows,
    styles: {
      fontSize: 8,
      cellPadding: 3,
    },
    headStyles: {
      fillColor: color,
      textColor: C.white,
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { fontStyle: 'normal', textColor: C.dark },
      1: { halign: 'right', textColor: C.gray, fontSize: 7 },
      2: { halign: 'right', fontStyle: 'bold', textColor: color },
    },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (doc as any).lastAutoTable.finalY + 8
}

function drawSalesDetail(doc: jsPDF, report: CashCloseReport, startY: number): number {
  if (report.sales.length === 0) return startY

  const symbol = cs(report.referenceCurrency)
  let y = startY

  doc.setFontSize(11)
  doc.setTextColor(...C.primary)
  doc.setFont('helvetica', 'bold')
  doc.text(`Detalle de Ventas (${report.sales.length} venta${report.sales.length !== 1 ? 's' : ''})`, 45, y)
  y += 6

  for (let si = 0; si < report.sales.length; si++) {
    const sale = report.sales[si]

    doc.setFillColor(...C.blueBg)
    doc.roundedRect(45, y, doc.internal.pageSize.getWidth() - 90, 16, 2, 2, 'F')
    doc.setFontSize(8)
    doc.setTextColor(...C.primary)
    doc.setFont('helvetica', 'bold')
    doc.text(
      `Venta #${si + 1}  |  ${fmtDate(sale.date)}  |  Cliente: ${sale.clientName || 'General'}`,
      50, y + 11
    )
    y += 20

    const linesBody = sale.lines.map(l => [
      l.productName,
      String(l.quantity),
      `${symbol}${fmt(l.unitPrice)}`,
      `${symbol}${fmt(l.lineTotal)}`,
    ])

    // Total row
    linesBody.push(['', '', 'TOTAL:', `${symbol}${fmt(sale.total)}`])

    autoTable(doc, {
      startY: y,
      theme: 'grid',
      margin: { left: 45, right: 45 },
      head: [['Producto', 'Cant.', 'P. Unit.', 'Total']],
      body: linesBody,
      styles: {
        fontSize: 7.5,
        cellPadding: 2,
      },
      headStyles: {
        fillColor: C.grayLight,
        textColor: C.gray,
        fontStyle: 'bold',
        fontSize: 7,
      },
      columnStyles: {
        0: { textColor: C.dark },
        1: { halign: 'center', cellWidth: 20 },
        2: { halign: 'right', cellWidth: 35 },
        3: { halign: 'right', fontStyle: 'bold', textColor: C.primary },
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.row.index === linesBody.length - 1) {
          data.cell.styles.fillColor = [240, 245, 255]
          data.cell.styles.fontStyle = 'bold'
        }
      },
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 2

    // Payment methods for this sale
    if (sale.payments.length > 0) {
      doc.setFontSize(6.5)
      doc.setTextColor(...C.gray)
      doc.setFont('helvetica', 'normal')
      const payStr = sale.payments.map(p =>
        `${p.method} ${symbol}${fmt(p.amount)}${p.reference ? ` (Ref: ${p.reference})` : ''}`
      ).join('  |  ')
      doc.text(payStr, 50, y, { maxWidth: doc.internal.pageSize.getWidth() - 100 })
      y += 8
    }

    y += 4
  }

  return y
}

function drawFooter(doc: jsPDF, totalPages: number, info: { businessName: string; businessRif: string }) {
  const pw = doc.internal.pageSize.getWidth()
  const ph = doc.internal.pageSize.getHeight()

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)

    doc.setDrawColor(...C.grayMedium)
    doc.setLineWidth(0.5)
    doc.line(45, ph - 40, pw - 45, ph - 40)

    doc.setFontSize(7)
    doc.setTextColor(...C.gray)
    doc.setFont('helvetica', 'normal')
    doc.text(
      `${info.businessName}  |  RIF: ${info.businessRif}  |  Generado por JO-Administrativo`,
      pw / 2, ph - 32, { align: 'center' }
    )

    if (totalPages > 1) {
      doc.text(`Pagina ${i} de ${totalPages}`, pw / 2, ph - 24, { align: 'center' })
    }
  }
}

// ─── PDF Generator ────────────────────────────────────────────────────────────

export async function generateCashClosePDF(report: CashCloseReport): Promise<Buffer> {
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

  // Header
  drawHeader(doc, report)

  // Register info
  let y = drawRegisterInfo(doc, report)

  // Financial summary
  y = drawFinancialSummary(doc, report, y)

  // Payment methods
  y = drawPaymentMethods(doc, report, y)

  // Expenses
  y = drawExpenses(doc, report, y, 'salida')

  // Entries
  y = drawExpenses(doc, report, y, 'entrada')

  // Sales detail
  y = drawSalesDetail(doc, report, y)

  // Footer
  const totalPages = doc.getNumberOfPages()
  drawFooter(doc, totalPages, { businessName: report.businessName, businessRif: report.businessRif })

  return Buffer.from(doc.output('arraybuffer'))
}

// ─── Multi-register PDF (for close-all) ───────────────────────────────────────

export async function generateMultiCashClosePDF(reports: CashCloseReport[]): Promise<Buffer> {
  if (reports.length === 1) {
    return generateCashClosePDF(reports[0])
  }

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
  // Blue header band
  doc.setFillColor(...C.primary)
  doc.rect(0, 0, pw, 110, 'F')

  doc.setFontSize(22)
  doc.setTextColor(...C.white)
  doc.setFont('helvetica', 'bold')
  doc.text(info.businessName, 45, 30)

  doc.setFontSize(10)
  doc.setTextColor(209, 213, 219)
  doc.setFont('helvetica', 'normal')
  doc.text(`RIF: ${info.businessRif}  |  ${info.businessAddress}`, 45, 52)

  doc.setFontSize(16)
  doc.setTextColor(...C.white)
  doc.setFont('helvetica', 'bold')
  doc.text('CIERRE MASIVO DE CAJAS', pw / 2, 82, { align: 'center' })

  doc.setFontSize(10)
  doc.setTextColor(209, 213, 219)
  doc.setFont('helvetica', 'normal')
  doc.text(`${reports.length} caja(s) cerradas  |  ${fmtDate(new Date())}`, pw / 2, 100, { align: 'center' })

  // Summary table on cover
  let y = 130
  doc.setFontSize(12)
  doc.setTextColor(...C.primary)
  doc.setFont('helvetica', 'bold')
  doc.text('Resumen General', 45, y)
  y += 6

  let grandTotalSales = 0
  let grandTotalExpected = 0
  let grandTotalActual = 0

  const bodyRows = reports.map(r => {
    grandTotalSales += r.totalSales
    grandTotalExpected += r.expected
    grandTotalActual += r.actual
    return [
      r.cashierName,
      r.registerName || '\u2014',
      `${symbol}${fmt(r.totalSales)}`,
      `${symbol}${fmt(r.expected)}`,
      `${symbol}${fmt(r.actual)}`,
      `${symbol}${fmt(r.difference)}`,
    ]
  })

  bodyRows.push([
    'TOTAL GENERAL',
    '',
    `${symbol}${fmt(grandTotalSales)}`,
    `${symbol}${fmt(grandTotalExpected)}`,
    `${symbol}${fmt(grandTotalActual)}`,
    `${symbol}${fmt(grandTotalActual - grandTotalExpected)}`,
  ])

  autoTable(doc, {
    startY: y,
    theme: 'grid',
    margin: { left: 45, right: 45 },
    head: [['Cajero/a', 'Caja', 'Ventas', 'Esperado', 'Real', 'Diferencia']],
    body: bodyRows,
    styles: {
      fontSize: 8,
      cellPadding: 3,
    },
    headStyles: {
      fillColor: C.primary,
      textColor: C.white,
      fontStyle: 'bold',
    },
    columnStyles: {
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index === bodyRows.length - 1) {
        data.cell.styles.fillColor = C.blueBg
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.textColor = C.primary
      }
      // Color difference column
      if (data.section === 'body' && data.column.index === 5 && data.row.index < bodyRows.length - 1) {
        const diff = reports[data.row.index]?.difference || 0
        data.cell.styles.textColor = diff === 0 ? C.green : diff > 0 ? C.amber : C.red
      }
    },
  })

  // ─── Individual reports ──────────────────────────────────────────────────
  for (let i = 0; i < reports.length; i++) {
    doc.addPage()
    const r = reports[i]

    // Header
    doc.setFillColor(...C.primary)
    doc.rect(0, 0, pw, 50, 'F')

    doc.setFontSize(14)
    doc.setTextColor(...C.white)
    doc.setFont('helvetica', 'bold')
    doc.text(`Caja ${i + 1}: ${r.registerName || 'Sin nombre'}`, 45, 22)

    doc.setFontSize(9)
    doc.setTextColor(209, 213, 219)
    doc.setFont('helvetica', 'normal')
    doc.text(
      `${r.branchName}  |  Cajero/a: ${r.cashierName}  |  Apertura: ${fmtDateShort(r.openingDate)}  |  Cierre: ${fmtDateShort(r.closingDate)}`,
      45, 40
    )

    // Financial summary compact
    const sym = cs(r.referenceCurrency)
    y = 58

    doc.setFillColor(...C.grayLight)
    doc.roundedRect(45, y, pw - 90, 70, 3, 3, 'F')

    doc.setFontSize(9)
    doc.setTextColor(...C.primary)
    doc.setFont('helvetica', 'bold')
    doc.text('Resumen Financiero', 55, y + 12)

    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')

    const rows = [
      ['Monto de Apertura:', `${sym}${fmt(r.initialAmt)}`],
      ['+ Ventas en Efectivo:', `${sym}${fmt(r.totalSales)}`],
      [`+ Entradas / - Gastos / - Retiros:`, `${sym}${fmt(r.totalEntries)} / ${sym}${fmt(r.totalExpenses)} / ${sym}${fmt(r.totalRetiros)}`],
      ['Monto Esperado:', `${sym}${fmt(r.expected)}`],
      ['Monto Real:', `${sym}${fmt(r.actual)}`],
      ['Diferencia:', `${sym}${fmt(r.difference)}`],
    ]

    let ry = y + 24
    for (const [label, value] of rows) {
      doc.setTextColor(...C.dark)
      doc.text(label, 55, ry)
      doc.setFont('helvetica', 'bold')
      // Color the difference
      if (label === 'Diferencia:') {
        const diffColor = r.difference === 0 ? C.green : r.difference > 0 ? C.amber : C.red
        doc.setTextColor(...diffColor)
      }
      doc.text(value, pw - 55, ry, { align: 'right' })
      doc.setFont('helvetica', 'normal')
      ry += 9
    }

    y = ry + 8

    // Payment methods
    y = drawPaymentMethods(doc, r, y)

    // Sales detail
    y = drawSalesDetail(doc, r, y)
  }

  // Footer
  const totalPages = doc.getNumberOfPages()
  drawFooter(doc, totalPages, { businessName: info.businessName, businessRif: info.businessRif })

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
    client?: { id: string; name: string } | null
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
      product: { id: string; name: string }
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
  const sales: SaleDetail[] = register.sales.map(s => ({
    id: s.id,
    date: s.date,
    clientName: s.client?.name || null,
    total: s.total,
    lines: s.lines.map(l => ({
      productName: l.product.name,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      lineTotal: l.lineTotal,
    })),
    payments: s.payments.map(p => ({
      method: p.method,
      amount: p.amount,
      currencyCode: p.currency.code,
      reference: p.reference,
    })),
  }))

  const expenses = register.movements
    .filter(m => m.type === 'salida')
    .map(m => ({ concept: m.concept, amount: m.amount, date: m.createdAt }))

  const entries = register.movements
    .filter(m => m.type === 'entrada')
    .map(m => ({ concept: m.concept, amount: m.amount, date: m.createdAt }))

  return {
    businessName,
    businessRif,
    businessAddress,
    businessPhone,
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
    entries,
    exchangeRate,
    referenceCurrency,
    ivaEnabled,
    ivaRate,
  }
}
