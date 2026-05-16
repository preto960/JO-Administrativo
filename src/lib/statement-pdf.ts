import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

interface Settings {
  businessName: string
  rif: string | null
  address: string | null
  phone: string | null
  email: string | null
  exchangeRate: number | null
  referenceCurrency: string | null
}

interface Client {
  id: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  note: string | null
}

interface ProductLine {
  product: { name: string; sku?: string }
  quantity: number
  unitPrice: number
  lineTotal: number
}

interface Payment {
  method: string
  amount: number
  currency: { symbol: string; code: string }
}

interface Sale {
  id: string
  date: string | Date
  total: number
  lines: ProductLine[]
  payments: Payment[]
  user: { name: string } | null
  branch: { name: string } | null
}

interface Receivable {
  id: string
  amount: number
  pendingBalance: number
  dueDate: string | Date | null
  status: string
  sale: Sale
}

export interface ClientWithReceivables extends Client {
  receivables: Receivable[]
}

export function generateStatementPDF(
  client: ClientWithReceivables,
  settings: Settings,
): Buffer {
  const businessName = settings.businessName || 'Mi Empresa'
  const rif = settings.rif || ''
  const address = settings.address || ''
  const phone = settings.phone || ''
  const exchangeRate = settings.exchangeRate || 0
  const referenceCurrency = settings.referenceCurrency || 'USD'

  const fmt = (n: number) =>
    n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const totalDebt = client.receivables.reduce((sum, r) => sum + r.pendingBalance, 0)
  const symbol = referenceCurrency === 'EUR' ? '\u20ac' : '$'

  // ─── Colors ───────────────────────────────────────────────────────────
  const blueHeader: [number, number, number] = [26, 58, 107]
  const accentBlue: [number, number, number] = [37, 99, 235]
  const lightGray: [number, number, number] = [243, 244, 246]
  const darkText: [number, number, number] = [31, 41, 55]
  const mutedText: [number, number, number] = [107, 114, 128]
  const redBg: [number, number, number] = [254, 242, 242]
  const redAccent: [number, number, number] = [220, 38, 38]
  const C_white: [number, number, number] = [255, 255, 255]

  // ─── Create PDF ───────────────────────────────────────────────────────
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'letter',
  })

  const pw = doc.internal.pageSize.getWidth()
  const ph = doc.internal.pageSize.getHeight()

  // ─── Header ──────────────────────────────────────────────────────────
  doc.setFillColor(...blueHeader)
  doc.rect(0, 0, pw, 100, 'F')

  doc.setFontSize(20)
  doc.setTextColor(...C_white)
  doc.setFont('helvetica', 'bold')
  doc.text(businessName, 40, 24)

  doc.setFontSize(9)
  doc.setTextColor(209, 213, 219)
  doc.setFont('helvetica', 'normal')
  let detailY = 46
  if (rif) { doc.text(`RIF: ${rif}`, 40, detailY); detailY += 14 }
  if (address) { doc.text(`Direccion: ${address}`, 40, detailY); detailY += 14 }
  if (phone) { doc.text(`Telefono: ${phone}`, 40, detailY) }

  doc.setFontSize(16)
  doc.setTextColor(...C_white)
  doc.setFont('helvetica', 'bold')
  doc.text('ESTADO DE CUENTA', pw - 40, 50, { align: 'right' })

  doc.setFontSize(9)
  doc.setTextColor(147, 197, 253)
  doc.setFont('helvetica', 'normal')
  doc.text(`Fecha: ${new Date().toLocaleDateString('es-VE', { year: 'numeric', month: '2-digit', day: '2-digit' })}`, pw - 40, 68, { align: 'right' })

  // ─── Client Info ─────────────────────────────────────────────────────
  let y = 112

  doc.setFillColor(...lightGray)
  doc.rect(40, y, pw - 80, 50, 'F')

  doc.setFontSize(8)
  doc.setTextColor(...mutedText)
  doc.setFont('helvetica', 'bold')
  doc.text('CLIENTE', 50, y + 12)

  doc.setFontSize(11)
  doc.setTextColor(...darkText)
  doc.setFont('helvetica', 'bold')
  doc.text(client.name, 50, y + 28)

  doc.setFontSize(8)
  doc.setTextColor(...mutedText)
  doc.setFont('helvetica', 'normal')
  const clientDetails: string[] = []
  if (client.phone) clientDetails.push(`Tel: ${client.phone}`)
  if (client.email) clientDetails.push(`Email: ${client.email}`)
  if (client.address) clientDetails.push(`Dir: ${client.address}`)
  if (clientDetails.length > 0) {
    doc.text(clientDetails.join('  |  '), 50, y + 42)
  }

  y += 62

  // ─── Debt Summary ────────────────────────────────────────────────────
  if (client.receivables.length === 0) {
    doc.setFontSize(12)
    doc.setTextColor(...accentBlue)
    doc.setFont('helvetica', 'bold')
    doc.text('Sin deuda pendiente', pw / 2, y + 40, { align: 'center' })
  } else {
    // Summary box
    doc.setFillColor(...redBg)
    doc.rect(40, y, pw - 80, 40, 'F')
    doc.setFillColor(...redAccent)
    doc.rect(40, y, 4, 40, 'F')

    doc.setFontSize(9)
    doc.setTextColor(153, 27, 27)
    doc.setFont('helvetica', 'bold')
    doc.text(`${client.receivables.length} factura(s) pendiente(s)`, 54, y + 14)

    doc.setFontSize(14)
    doc.setTextColor(...redAccent)
    doc.text(`Deuda Total: ${symbol}${fmt(totalDebt)}`, 54, y + 32)

    y += 52

    // ─── Detail per receivable (no summary table) ──────────────────────
    for (const r of client.receivables) {
      const sale = r.sale
      if (y + 100 > ph - 80) { doc.addPage(); y = 40 }

      // Sale header
      const saleDate = sale.date
        ? new Date(sale.date).toLocaleDateString('es-VE', { year: 'numeric', month: '2-digit', day: '2-digit' })
        : ''
      const saleNum = sale.id.substring(0, 8).toUpperCase()

      doc.setFillColor(238, 242, 255)
      doc.rect(40, y, pw - 80, 20, 'F')
      doc.setFontSize(8)
      doc.setTextColor(...accentBlue)
      doc.setFont('helvetica', 'bold')
      doc.text(`Factura No ${saleNum}  |  ${saleDate}  |  Sucursal: ${sale.branch?.name || '\u2014'}  |  Cajero: ${sale.user?.name || '\u2014'}`, 50, y + 13)
      y += 26

      // Product lines
      const linesBody = sale.lines.map((line, idx) => [
        String(idx + 1),
        line.product.name,
        String(line.quantity),
        `${symbol}${fmt(line.unitPrice)}`,
        `${symbol}${fmt(line.lineTotal)}`,
      ])

      autoTable(doc, {
        startY: y,
        theme: 'grid',
        margin: { left: 60, right: 40 },
        head: [['#', 'Producto', 'Cant.', 'P. Unit.', 'Total']],
        body: linesBody,
        styles: {
          fontSize: 7.5,
          cellPadding: 3,
        },
        headStyles: {
          fillColor: lightGray,
          textColor: mutedText,
          fontStyle: 'bold',
          fontSize: 7,
        },
        columnStyles: {
          0: { cellWidth: 20 },
          3: { halign: 'right', cellWidth: 55 },
          4: { halign: 'right', fontStyle: 'bold', textColor: accentBlue },
        },
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      y = (doc as any).lastAutoTable.finalY + 6

      // Pending balance for this sale
      doc.setFontSize(8)
      doc.setTextColor(...mutedText)
      doc.setFont('helvetica', 'normal')
      doc.text(`Total venta: ${symbol}${fmt(sale.total)}  |  Pagos: ${sale.payments.map(p => `${p.method} ${p.currency.symbol}${fmt(p.amount)}`).join(', ') || 'Credito'}`, 60, y)
      y += 12

      doc.setFontSize(9)
      doc.setTextColor(...redAccent)
      doc.setFont('helvetica', 'bold')
      doc.text(`Saldo pendiente: ${symbol}${fmt(r.pendingBalance)}`, 60, y)

      if (r.dueDate) {
        doc.setTextColor(...mutedText)
        doc.setFont('helvetica', 'normal')
        doc.text(`  |  Vence: ${new Date(r.dueDate).toLocaleDateString('es-VE', { year: 'numeric', month: '2-digit', day: '2-digit' })}`, 60 + doc.getTextWidth(`Saldo pendiente: ${symbol}${fmt(r.pendingBalance)}`) + 8, y)
      }

      y += 20
    }

    // ─── Grand Total ────────────────────────────────────────────────────
    if (y + 40 > ph - 80) { doc.addPage(); y = 40 }

    doc.setFillColor(...redBg)
    doc.rect(40, y, pw - 80, 30, 'F')
    doc.setFillColor(...redAccent)
    doc.rect(40, y, 4, 30, 'F')

    doc.setFontSize(11)
    doc.setTextColor(...redAccent)
    doc.setFont('helvetica', 'bold')
    doc.text('TOTAL DEUDA PENDIENTE', 54, y + 19)

    doc.setFontSize(14)
    doc.text(`${symbol}${fmt(totalDebt)}`, pw - 54, y + 19, { align: 'right' })
  }

  // ─── Exchange rate ───────────────────────────────────────────────────
  if (exchangeRate > 0 && totalDebt > 0) {
    doc.setFontSize(8)
    doc.setTextColor(...mutedText)
    doc.setFont('helvetica', 'normal')
    doc.text(
      `Tasa de cambio: 1 ${referenceCurrency} = ${fmt(exchangeRate)} Bs  |  Deuda total: ${fmt(totalDebt * exchangeRate)} Bs`,
      pw / 2, ph - 45, { align: 'center' }
    )
  }

  // ─── Footer ──────────────────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)

    doc.setDrawColor(209, 213, 219)
    doc.setLineWidth(0.5)
    doc.line(40, ph - 35, pw - 40, ph - 35)

    doc.setFontSize(7)
    doc.setTextColor(...mutedText)
    doc.setFont('helvetica', 'normal')
    doc.text(
      `${businessName} \u2014 Generado el ${new Date().toLocaleDateString('es-VE')}`,
      pw / 2, ph - 22, { align: 'center' },
    )
    doc.text(
      `Estado de Cuenta  |  Pagina ${i} de ${totalPages}`,
      pw / 2, ph - 12, { align: 'center' },
    )
  }

  return Buffer.from(doc.output('arraybuffer'))
}
