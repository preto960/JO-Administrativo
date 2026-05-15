import PDFDocument from 'pdfkit'
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
  // Register info
  registerId: string
  registerName: string | null
  branchName: string
  cashierName: string
  openingDate: Date
  closingDate: Date
  initialAmt: number
  // Totals
  totalSales: number
  totalExpenses: number
  totalEntries: number
  totalRetiros: number
  expected: number
  actual: number
  difference: number
  // Sales detail
  sales: SaleDetail[]
  // Expense detail
  expenses: { concept: string; amount: number; date: Date }[]
  // Entry detail
  entries: { concept: string; amount: number; date: Date }[]
  // Exchange info
  exchangeRate: number
  referenceCurrency: string
}

// ─── Colors ───────────────────────────────────────────────────────────────────

const COLORS = {
  primary: '#1e40af',
  primaryLight: '#3b82f6',
  green: '#16a34a',
  red: '#dc2626',
  gray: '#6b7280',
  grayLight: '#f3f4f6',
  grayMedium: '#e5e7eb',
  dark: '#111827',
  white: '#ffffff',
  black: '#000000',
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

function currencySymbol(refCurrency: string): string {
  if (refCurrency === 'EUR') return '\u20ac'
  return '$'
}

// ─── PDF Generator ────────────────────────────────────────────────────────────

export async function generateCashClosePDF(report: CashCloseReport): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 40, bottom: 40, left: 45, right: 45 },
      bufferPages: true,
      info: {
        Title: `Cierre de Caja - ${report.registerName || 'Sin nombre'} - ${fmtDateShort(report.closingDate)}`,
        Author: report.businessName,
        Subject: 'Reporte de cierre de caja',
      },
    })

    const buffers: Buffer[] = []
    doc.on('data', (chunk) => buffers.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(buffers)))
    doc.on('error', reject)

    const cs = currencySymbol(report.referenceCurrency)
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right

    // ─── Fonts ────────────────────────────────────────────────────────────────
    const fontRegular = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
    const fontBold = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

    doc.registerFont('Regular', fontRegular)
    doc.registerFont('Bold', fontBold)

    // ─── Header ───────────────────────────────────────────────────────────────
    // Company header band
    doc.rect(0, 0, doc.page.width, 80).fill(COLORS.primary)

    doc.font('Bold').fontSize(18).fillColor(COLORS.white)
    doc.text(report.businessName, 45, 18, { width: pageWidth })
    doc.font('Regular').fontSize(9).fillColor('#d1d5db')
    doc.text(`RIF: ${report.businessRif}`, 45, 42)
    doc.text(`${report.businessAddress}  |  Tel: ${report.businessPhone}`, 45, 55)

    doc.font('Bold').fontSize(10).fillColor(COLORS.white)
    doc.text('REPORTE DE CIERRE DE CAJA', 45, 68, { align: 'right', width: pageWidth })

    doc.fillColor(COLORS.dark)

    // ─── Register info ────────────────────────────────────────────────────────
    let y = 95
    doc.rect(45, y, pageWidth, 72).fill('#f0f5ff').stroke(COLORS.primaryLight)
    doc.font('Bold').fontSize(10).fillColor(COLORS.primary)
    doc.text('Informacion de la Caja', 55, y + 8)
    doc.font('Regular').fontSize(9).fillColor(COLORS.dark)

    const infoX1 = 55
    const infoX2 = 45 + pageWidth / 2
    doc.text(`Sucursal: ${report.branchName}`, infoX1, y + 25)
    doc.text(`Cajero/a: ${report.cashierName}`, infoX2, y + 25)
    doc.text(`Caja: ${report.registerName || 'Sin nombre'}`, infoX1, y + 40)
    doc.text(`ID: ${report.registerId.slice(0, 8)}...`, infoX2, y + 40)
    doc.text(`Apertura: ${fmtDate(report.openingDate)}`, infoX1, y + 55)
    doc.text(`Cierre: ${fmtDate(report.closingDate)}`, infoX2, y + 55)

    y += 82

    // ─── Financial summary ────────────────────────────────────────────────────
    doc.font('Bold').fontSize(11).fillColor(COLORS.primary)
    doc.text('Resumen Financiero', 45, y)
    y += 18

    const summaryRows = [
      ['Monto de Apertura', `${cs}${fmt(report.initialAmt)}`],
      ['+ Ventas en Efectivo', `${cs}${fmt(report.totalSales)}`, COLORS.green],
      ['+ Entradas de Efectivo', `${cs}${fmt(report.totalEntries)}`, COLORS.green],
      ['- Gastos / Salidas', `${cs}${fmt(report.totalExpenses)}`, COLORS.red],
      ['- Retiros de Excedente', `${cs}${fmt(report.totalRetiros)}`, COLORS.red],
    ]

    // Summary table
    const col1W = pageWidth * 0.6
    const col2W = pageWidth * 0.4

    doc.rect(45, y, pageWidth, summaryRows.length * 20 + 2).fill(COLORS.grayLight)
    for (const [label, value, color] of summaryRows) {
      doc.font('Regular').fontSize(9).fillColor(COLORS.dark)
      doc.text(label, 55, y + 3, { width: col1W })
      doc.font('Bold').fontSize(9).fillColor(color || COLORS.dark)
      doc.text(value, 55 + col1W, y + 3, { width: col2W, align: 'right' })
      y += 20
    }

    // Divider
    y += 2
    doc.moveTo(45, y).lineTo(45 + pageWidth, y).strokeColor(COLORS.primary).lineWidth(1.5).stroke()
    y += 6

    const resultRows = [
      ['Monto Esperado', `${cs}${fmt(report.expected)}`],
      ['Monto Real (Contado)', `${cs}${fmt(report.actual)}`],
      ['Diferencia', `${cs}${fmt(report.difference)}`, report.difference === 0 ? COLORS.green : report.difference > 0 ? '#b45309' : COLORS.red],
    ]

    doc.rect(45, y, pageWidth, resultRows.length * 20 + 2).fill('#fffbeb')
    for (const [label, value, color] of resultRows) {
      doc.font('Regular').fontSize(9).fillColor(COLORS.dark)
      doc.text(label, 55, y + 3, { width: col1W })
      doc.font('Bold').fontSize(9).fillColor(color || COLORS.dark)
      doc.text(value, 55 + col1W, y + 3, { width: col2W, align: 'right' })
      y += 20
    }

    y += 12

    // ─── Exchange rate info ───────────────────────────────────────────────────
    if (report.exchangeRate > 0) {
      const totalBs = report.expected * report.exchangeRate
      doc.font('Regular').fontSize(8).fillColor(COLORS.gray)
      doc.text(`Tasa de cambio: 1 ${report.referenceCurrency} = ${fmt(report.exchangeRate)} Bs  |  Total esperado en Bs: ${fmt(totalBs)} Bs`, 45, y, { width: pageWidth, align: 'center' })
      y += 16
    }

    // ─── Payment methods breakdown ────────────────────────────────────────────
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

    if (paymentMap.size > 0) {
      // Check if we need a new page
      if (y > doc.page.height - 180) { doc.addPage(); y = 45 }

      doc.font('Bold').fontSize(11).fillColor(COLORS.primary)
      doc.text('Desglose por Metodo de Pago', 45, y)
      y += 18

      doc.rect(45, y, pageWidth, 22).fill(COLORS.primary)
      doc.font('Bold').fontSize(9).fillColor(COLORS.white)
      doc.text('Metodo', 55, y + 5, { width: pageWidth * 0.4 })
      doc.text('Cantidad', 55 + pageWidth * 0.4, y + 5, { width: pageWidth * 0.2, align: 'right' })
      doc.text('Monto Total', 55 + pageWidth * 0.6, y + 5, { width: pageWidth * 0.4, align: 'right' })
      y += 24

      const pmBg = [COLORS.grayLight, COLORS.white]
      let pmIdx = 0
      for (const [method, data] of paymentMap.entries()) {
        doc.rect(45, y, pageWidth, 18).fill(pmBg[pmIdx % 2])
        doc.font('Regular').fontSize(9).fillColor(COLORS.dark)
        doc.text(method.charAt(0).toUpperCase() + method.slice(1), 55, y + 4, { width: pageWidth * 0.4 })
        doc.text(`${data.count}`, 55 + pageWidth * 0.4, y + 4, { width: pageWidth * 0.2, align: 'right' })
        doc.font('Bold').fontSize(9)
        doc.text(`${cs}${fmt(data.amount)}`, 55 + pageWidth * 0.6, y + 4, { width: pageWidth * 0.4, align: 'right' })
        y += 18
        pmIdx++
      }

      // Total row
      doc.rect(45, y, pageWidth, 20).fill('#e0e7ff')
      doc.font('Bold').fontSize(9).fillColor(COLORS.primary)
      doc.text('TOTAL', 55, y + 4, { width: pageWidth * 0.6 })
      doc.text(`${cs}${fmt(totalAllPayments)}`, 55 + pageWidth * 0.6, y + 4, { width: pageWidth * 0.4, align: 'right' })
      y += 28
    }

    // ─── Expenses detail ──────────────────────────────────────────────────────
    if (report.expenses.length > 0) {
      if (y > doc.page.height - 140) { doc.addPage(); y = 45 }

      doc.font('Bold').fontSize(11).fillColor(COLORS.red)
      doc.text('Gastos y Salidas', 45, y)
      y += 18

      doc.rect(45, y, pageWidth, 22).fill(COLORS.red)
      doc.font('Bold').fontSize(9).fillColor(COLORS.white)
      doc.text('Concepto', 55, y + 5, { width: pageWidth * 0.5 })
      doc.text('Fecha', 55 + pageWidth * 0.5, y + 5, { width: pageWidth * 0.2, align: 'right' })
      doc.text('Monto', 55 + pageWidth * 0.7, y + 5, { width: pageWidth * 0.3, align: 'right' })
      y += 24

      let expIdx = 0
      for (const exp of report.expenses) {
        doc.rect(45, y, pageWidth, 18).fill(pmBg(expIdx))
        doc.font('Regular').fontSize(9).fillColor(COLORS.dark)
        doc.text(exp.concept, 55, y + 4, { width: pageWidth * 0.5 })
        doc.font('Regular').fontSize(8).fillColor(COLORS.gray)
        doc.text(fmtDateShort(exp.date), 55 + pageWidth * 0.5, y + 5, { width: pageWidth * 0.2, align: 'right' })
        doc.font('Bold').fontSize(9).fillColor(COLORS.red)
        doc.text(`-${cs}${fmt(exp.amount)}`, 55 + pageWidth * 0.7, y + 4, { width: pageWidth * 0.3, align: 'right' })
        y += 18
        expIdx++
      }
      y += 12
    }

    // ─── Entries detail ───────────────────────────────────────────────────────
    if (report.entries.length > 0) {
      if (y > doc.page.height - 140) { doc.addPage(); y = 45 }

      doc.font('Bold').fontSize(11).fillColor(COLORS.green)
      doc.text('Entradas de Efectivo', 45, y)
      y += 18

      doc.rect(45, y, pageWidth, 22).fill(COLORS.green)
      doc.font('Bold').fontSize(9).fillColor(COLORS.white)
      doc.text('Concepto', 55, y + 5, { width: pageWidth * 0.5 })
      doc.text('Fecha', 55 + pageWidth * 0.5, y + 5, { width: pageWidth * 0.2, align: 'right' })
      doc.text('Monto', 55 + pageWidth * 0.7, y + 5, { width: pageWidth * 0.3, align: 'right' })
      y += 24

      let entIdx = 0
      for (const ent of report.entries) {
        doc.rect(45, y, pageWidth, 18).fill(pmBg(entIdx))
        doc.font('Regular').fontSize(9).fillColor(COLORS.dark)
        doc.text(ent.concept, 55, y + 4, { width: pageWidth * 0.5 })
        doc.font('Regular').fontSize(8).fillColor(COLORS.gray)
        doc.text(fmtDateShort(ent.date), 55 + pageWidth * 0.5, y + 5, { width: pageWidth * 0.2, align: 'right' })
        doc.font('Bold').fontSize(9).fillColor(COLORS.green)
        doc.text(`+${cs}${fmt(ent.amount)}`, 55 + pageWidth * 0.7, y + 4, { width: pageWidth * 0.3, align: 'right' })
        y += 18
        entIdx++
      }
      y += 12
    }

    // ─── Detailed sales ───────────────────────────────────────────────────────
    if (report.sales.length > 0) {
      if (y > doc.page.height - 100) { doc.addPage(); y = 45 }

      doc.font('Bold').fontSize(11).fillColor(COLORS.primary)
      doc.text(`Detalle de Ventas (${report.sales.length} venta${report.sales.length !== 1 ? 's' : ''})`, 45, y)
      y += 20

      for (let si = 0; si < report.sales.length; si++) {
        const sale = report.sales[si]

        // Check space — sale block needs at least 60px + lines
        const saleBlockHeight = 35 + sale.lines.length * 18 + sale.payments.length * 16
        if (y + saleBlockHeight > doc.page.height - 50) {
          doc.addPage()
          y = 45
        }

        // Sale header
        doc.rect(45, y, pageWidth, 24).fill('#e0e7ff')
        doc.font('Bold').fontSize(9).fillColor(COLORS.primary)
        doc.text(`Venta #${si + 1}  |  ${fmtDate(sale.date)}  |  Cliente: ${sale.clientName || 'General'}`, 55, y + 7, { width: pageWidth - 20 })
        y += 26

        // Sale lines header
        doc.rect(45, y, pageWidth, 16).fill(COLORS.grayLight)
        doc.font('Bold').fontSize(8).fillColor(COLORS.gray)
        doc.text('Producto', 55, y + 3, { width: pageWidth * 0.45 })
        doc.text('Cant.', 55 + pageWidth * 0.45, y + 3, { width: pageWidth * 0.1, align: 'right' })
        doc.text('P. Unit.', 55 + pageWidth * 0.55, y + 3, { width: pageWidth * 0.15, align: 'right' })
        doc.text('Total', 55 + pageWidth * 0.7, y + 3, { width: pageWidth * 0.3, align: 'right' })
        y += 17

        // Sale lines
        for (const line of sale.lines) {
          doc.font('Regular').fontSize(8).fillColor(COLORS.dark)
          doc.text(line.productName, 55, y + 3, { width: pageWidth * 0.45 })
          doc.text(`${line.quantity}`, 55 + pageWidth * 0.45, y + 3, { width: pageWidth * 0.1, align: 'right' })
          doc.text(`${cs}${fmt(line.unitPrice)}`, 55 + pageWidth * 0.55, y + 3, { width: pageWidth * 0.15, align: 'right' })
          doc.font('Bold').fontSize(8)
          doc.text(`${cs}${fmt(line.lineTotal)}`, 55 + pageWidth * 0.7, y + 3, { width: pageWidth * 0.3, align: 'right' })
          y += 16
        }

        // Sale total
        doc.moveTo(55 + pageWidth * 0.7, y).lineTo(45 + pageWidth - 5, y).strokeColor(COLORS.grayMedium).lineWidth(0.5).stroke()
        y += 3
        doc.font('Bold').fontSize(9).fillColor(COLORS.primary)
        doc.text(`TOTAL: ${cs}${fmt(sale.total)}`, 55 + pageWidth * 0.55, y, { width: pageWidth * 0.45, align: 'right' })
        y += 14

        // Payment methods for this sale
        if (sale.payments.length > 0) {
          doc.font('Regular').fontSize(7).fillColor(COLORS.gray)
          const payStr = sale.payments.map(p =>
            `${p.method} ${cs}${fmt(p.amount)}${p.reference ? ` (Ref: ${p.reference})` : ''}`
          ).join('  |  ')
          doc.text(payStr, 55, y, { width: pageWidth - 20 })
          y += 14
        }

        y += 8
      }
    }

    // ─── Footer ───────────────────────────────────────────────────────────────
    const range = doc.bufferedPageRange()
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i)
      // Footer line
      doc.moveTo(45, doc.page.height - 35).lineTo(doc.page.width - 45, doc.page.height - 35).strokeColor(COLORS.grayMedium).lineWidth(0.5).stroke()
      doc.font('Regular').fontSize(7).fillColor(COLORS.gray)
      doc.text(
        `${report.businessName}  |  RIF: ${report.businessRif}  |  Generado por JO-Administrativo`,
        45, doc.page.height - 30, { width: pageWidth, align: 'center' }
      )
      if (range.count > 1) {
        doc.text(`Pagina ${i + 1} de ${range.count}`, 45, doc.page.height - 20, { width: pageWidth, align: 'center' })
      }
    }

    doc.end()
  })
}

// ─── Multi-register PDF (for close-all) ───────────────────────────────────────

export async function generateMultiCashClosePDF(reports: CashCloseReport[]): Promise<Buffer> {
  if (reports.length === 1) {
    return generateCashClosePDF(reports[0])
  }

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 40, bottom: 40, left: 45, right: 45 },
      bufferPages: true,
      info: {
        Title: `Cierre Masivo de Cajas - ${fmtDateShort(new Date())}`,
        Author: reports[0]?.businessName || 'JO-Administrativo',
        Subject: 'Reporte de cierre masivo de cajas',
      },
    })

    const buffers: Buffer[] = []
    doc.on('data', (chunk) => buffers.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(buffers)))
    doc.on('error', reject)

    const cs = currencySymbol(reports[0]?.referenceCurrency || 'USD')
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right

    doc.registerFont('Regular', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
    doc.registerFont('Bold', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')

    const info = reports[0]

    // ─── Cover page ───────────────────────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 120).fill(COLORS.primary)
    doc.font('Bold').fontSize(22).fillColor(COLORS.white)
    doc.text(info.businessName, 45, 25, { width: pageWidth })
    doc.font('Regular').fontSize(10).fillColor('#d1d5db')
    doc.text(`RIF: ${info.businessRif}  |  ${info.businessAddress}`, 45, 55)

    doc.font('Bold').fontSize(16).fillColor(COLORS.white)
    doc.text('CIERRE MASIVO DE CAJAS', 45, 85, { width: pageWidth, align: 'center' })
    doc.font('Regular').fontSize(10).fillColor('#d1d5db')
    doc.text(`${reports.length} caja(s) cerradas  |  ${fmtDate(new Date())}`, 45, 108, { width: pageWidth, align: 'center' })

    // Summary table on cover
    let y = 135
    doc.font('Bold').fontSize(12).fillColor(COLORS.primary)
    doc.text('Resumen General', 45, y)
    y += 22

    doc.rect(45, y, pageWidth, 22).fill(COLORS.primary)
    doc.font('Bold').fontSize(9).fillColor(COLORS.white)
    doc.text('Cajero/a', 55, y + 5, { width: pageWidth * 0.2 })
    doc.text('Caja', 55 + pageWidth * 0.2, y + 5, { width: pageWidth * 0.15 })
    doc.text('Ventas', 55 + pageWidth * 0.35, y + 5, { width: pageWidth * 0.15, align: 'right' })
    doc.text('Esperado', 55 + pageWidth * 0.5, y + 5, { width: pageWidth * 0.15, align: 'right' })
    doc.text('Real', 55 + pageWidth * 0.65, y + 5, { width: pageWidth * 0.15, align: 'right' })
    doc.text('Diferencia', 55 + pageWidth * 0.8, y + 5, { width: pageWidth * 0.2, align: 'right' })
    y += 24

    const pmBg = [COLORS.grayLight, COLORS.white]
    let grandTotalSales = 0
    let grandTotalExpected = 0
    let grandTotalActual = 0

    for (let i = 0; i < reports.length; i++) {
      const r = reports[i]
      grandTotalSales += r.totalSales
      grandTotalExpected += r.expected
      grandTotalActual += r.actual

      doc.rect(45, y, pageWidth, 20).fill(pmBg[i % 2])
      doc.font('Regular').fontSize(9).fillColor(COLORS.dark)
      doc.text(r.cashierName, 55, y + 5, { width: pageWidth * 0.2 })
      doc.text(r.registerName || '—', 55 + pageWidth * 0.2, y + 5, { width: pageWidth * 0.15 })
      doc.text(`${cs}${fmt(r.totalSales)}`, 55 + pageWidth * 0.35, y + 5, { width: pageWidth * 0.15, align: 'right' })
      doc.text(`${cs}${fmt(r.expected)}`, 55 + pageWidth * 0.5, y + 5, { width: pageWidth * 0.15, align: 'right' })
      doc.text(`${cs}${fmt(r.actual)}`, 55 + pageWidth * 0.65, y + 5, { width: pageWidth * 0.15, align: 'right' })
      const diffColor = r.difference === 0 ? COLORS.green : r.difference > 0 ? '#b45309' : COLORS.red
      doc.font('Bold').fontSize(9).fillColor(diffColor)
      doc.text(`${cs}${fmt(r.difference)}`, 55 + pageWidth * 0.8, y + 5, { width: pageWidth * 0.2, align: 'right' })
      y += 20
    }

    // Grand total
    doc.rect(45, y, pageWidth, 22).fill('#e0e7ff')
    doc.font('Bold').fontSize(10).fillColor(COLORS.primary)
    doc.text('TOTAL GENERAL', 55, y + 5, { width: pageWidth * 0.5 })
    doc.text(`${cs}${fmt(grandTotalSales)}`, 55 + pageWidth * 0.35, y + 5, { width: pageWidth * 0.15, align: 'right' })
    doc.text(`${cs}${fmt(grandTotalExpected)}`, 55 + pageWidth * 0.5, y + 5, { width: pageWidth * 0.15, align: 'right' })
    doc.text(`${cs}${fmt(grandTotalActual)}`, 55 + pageWidth * 0.65, y + 5, { width: pageWidth * 0.15, align: 'right' })
    y += 40

    // ─── Individual reports ───────────────────────────────────────────────────
    for (let i = 0; i < reports.length; i++) {
      doc.addPage()
      // We'll rely on the individual report function, but since we need to combine into one doc,
      // we'll render a simplified version inline

      const r = reports[i]

      // Register header
      doc.rect(0, 0, doc.page.width, 50).fill(COLORS.primary)
      doc.font('Bold').fontSize(14).fillColor(COLORS.white)
      doc.text(`Caja ${i + 1}: ${r.registerName || 'Sin nombre'}`, 45, 12)
      doc.font('Regular').fontSize(9).fillColor('#d1d5db')
      doc.text(`${r.branchName}  |  Cajero/a: ${r.cashierName}  |  Apertura: ${fmtDateShort(r.openingDate)}  |  Cierre: ${fmtDateShort(r.closingDate)}`, 45, 32)

      let ry = 60

      // Financial summary compact
      doc.rect(45, ry, pageWidth, 80).fill(COLORS.grayLight)
      doc.font('Bold').fontSize(9).fillColor(COLORS.primary)
      doc.text('Resumen Financiero', 55, ry + 5)

      const compactRows = [
        ['Monto de Apertura:', `${cs}${fmt(r.initialAmt)}`],
        ['+ Ventas en Efectivo:', `${cs}${fmt(r.totalSales)}`],
        [`+ Entradas / - Gastos / - Retiros:`, `${cs}${fmt(r.totalEntries)} / ${cs}${fmt(r.totalExpenses)} / ${cs}${fmt(r.totalRetiros)}`],
        ['Monto Esperado:', `${cs}${fmt(r.expected)}`],
        ['Monto Real:', `${cs}${fmt(r.actual)}`],
        ['Diferencia:', `${cs}${fmt(r.difference)}`, r.difference === 0 ? COLORS.green : r.difference > 0 ? '#b45309' : COLORS.red],
      ]

      let ry2 = ry + 18
      for (const [label, value, color] of compactRows) {
        doc.font('Regular').fontSize(8).fillColor(COLORS.dark)
        doc.text(label, 55, ry2, { width: pageWidth * 0.6 })
        doc.font('Bold').fontSize(8).fillColor(color || COLORS.dark)
        doc.text(value, 55 + pageWidth * 0.6, ry2, { width: pageWidth * 0.4, align: 'right' })
        ry2 += 10
      }
      ry += 88

      // Payment methods
      const paymentMap = new Map<string, { amount: number; count: number }>()
      for (const sale of r.sales) {
        for (const p of sale.payments) {
          const key = p.method
          const current = paymentMap.get(key) || { amount: 0, count: 0 }
          current.amount += p.amount
          current.count++
          paymentMap.set(key, current)
        }
      }

      if (paymentMap.size > 0) {
        doc.font('Bold').fontSize(9).fillColor(COLORS.primary)
        doc.text('Metodos de Pago', 45, ry)
        ry += 15

        doc.rect(45, ry, pageWidth, 18).fill(COLORS.primary)
        doc.font('Bold').fontSize(8).fillColor(COLORS.white)
        doc.text('Metodo', 55, ry + 4, { width: pageWidth * 0.4 })
        doc.text('Cantidad', 55 + pageWidth * 0.4, ry + 4, { width: pageWidth * 0.2, align: 'right' })
        doc.text('Monto Total', 55 + pageWidth * 0.6, ry + 4, { width: pageWidth * 0.4, align: 'right' })
        ry += 20

        let pmi = 0
        for (const [method, data] of paymentMap.entries()) {
          doc.rect(45, ry, pageWidth, 16).fill(pmBg[pmi % 2])
          doc.font('Regular').fontSize(8).fillColor(COLORS.dark)
          doc.text(method.charAt(0).toUpperCase() + method.slice(1), 55, ry + 3, { width: pageWidth * 0.4 })
          doc.text(`${data.count}`, 55 + pageWidth * 0.4, ry + 3, { width: pageWidth * 0.2, align: 'right' })
          doc.font('Bold').fontSize(8)
          doc.text(`${cs}${fmt(data.amount)}`, 55 + pageWidth * 0.6, ry + 3, { width: pageWidth * 0.4, align: 'right' })
          ry += 16
          pmi++
        }
        ry += 12
      }

      // Sales detail
      if (r.sales.length > 0) {
        if (ry > doc.page.height - 120) { doc.addPage(); ry = 45 }
        doc.font('Bold').fontSize(9).fillColor(COLORS.primary)
        doc.text(`Ventas Detalladas (${r.sales.length})`, 45, ry)
        ry += 16

        for (let si = 0; si < r.sales.length; si++) {
          const sale = r.sales[si]
          const blockH = 30 + sale.lines.length * 15 + sale.payments.length * 12
          if (ry + blockH > doc.page.height - 50) { doc.addPage(); ry = 45 }

          doc.rect(45, ry, pageWidth, 18).fill('#e0e7ff')
          doc.font('Bold').fontSize(8).fillColor(COLORS.primary)
          doc.text(`#${si + 1}  ${fmtDateShort(sale.date)}  |  ${sale.clientName || 'General'}`, 55, ry + 4, { width: pageWidth - 20 })
          ry += 20

          for (const line of sale.lines) {
            doc.font('Regular').fontSize(7.5).fillColor(COLORS.dark)
            doc.text(line.productName, 55, ry + 2, { width: pageWidth * 0.45 })
            doc.text(`${line.quantity}`, 55 + pageWidth * 0.45, ry + 2, { width: pageWidth * 0.1, align: 'right' })
            doc.text(`${cs}${fmt(line.unitPrice)}`, 55 + pageWidth * 0.55, ry + 2, { width: pageWidth * 0.15, align: 'right' })
            doc.font('Bold').fontSize(7.5)
            doc.text(`${cs}${fmt(line.lineTotal)}`, 55 + pageWidth * 0.7, ry + 2, { width: pageWidth * 0.3, align: 'right' })
            ry += 13
          }

          doc.font('Bold').fontSize(8).fillColor(COLORS.primary)
          doc.text(`TOTAL: ${cs}${fmt(sale.total)}`, 55 + pageWidth * 0.55, ry, { width: pageWidth * 0.45, align: 'right' })
          ry += 12

          if (sale.payments.length > 0) {
            doc.font('Regular').fontSize(7).fillColor(COLORS.gray)
            const payStr = sale.payments.map(p =>
              `${p.method} ${cs}${fmt(p.amount)}${p.reference ? ` (Ref: ${p.reference})` : ''}`
            ).join('  |  ')
            doc.text(payStr, 55, ry, { width: pageWidth - 20 })
            ry += 12
          }
          ry += 6
        }
      }
    }

    // ─── Footer ───────────────────────────────────────────────────────────────
    const range = doc.bufferedPageRange()
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i)
      doc.moveTo(45, doc.page.height - 35).lineTo(doc.page.width - 45, doc.page.height - 35).strokeColor(COLORS.grayMedium).lineWidth(0.5).stroke()
      doc.font('Regular').fontSize(7).fillColor(COLORS.gray)
      doc.text(
        `${info.businessName}  |  RIF: ${info.businessRif}  |  JO-Administrativo`,
        45, doc.page.height - 30, { width: pageWidth, align: 'center' }
      )
      doc.text(`Pagina ${i + 1} de ${range.count}`, 45, doc.page.height - 20, { width: pageWidth, align: 'center' })
    }

    doc.end()
  })
}

// Helper for alternating row colors
function pmBg(idx: number): string {
  return idx % 2 === 0 ? COLORS.grayLight : COLORS.white
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
  }
}
