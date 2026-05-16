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
  const blue: [number, number, number] = [26, 58, 107]
  const white: [number, number, number] = [255, 255, 255]
  const dark: [number, number, number] = [31, 41, 55]
  const muted: [number, number, number] = [107, 114, 128]

  // ─── Create PDF ───────────────────────────────────────────────────────
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'letter',
  })

  const pw = doc.internal.pageSize.getWidth()
  const ph = doc.internal.pageSize.getHeight()

  // ─── Header bar ───────────────────────────────────────────────────────
  doc.setFillColor(...blue)
  doc.rect(0, 0, pw, 90, 'F')

  doc.setFontSize(18)
  doc.setTextColor(...white)
  doc.setFont('helvetica', 'bold')
  doc.text(businessName, 40, 28)

  doc.setFontSize(9)
  doc.setTextColor(200, 210, 225)
  doc.setFont('helvetica', 'normal')
  let infoY = 48
  if (rif) { doc.text(`RIF: ${rif}`, 40, infoY); infoY += 14 }
  if (address) { doc.text(`Direccion: ${address}`, 40, infoY); infoY += 14 }
  if (phone) { doc.text(`Telefono: ${phone}`, 40, infoY) }

  doc.setFontSize(16)
  doc.setTextColor(...white)
  doc.setFont('helvetica', 'bold')
  doc.text('ESTADO DE CUENTA', pw - 40, 40, { align: 'right' })

  doc.setFontSize(9)
  doc.setTextColor(160, 190, 230)
  doc.setFont('helvetica', 'normal')
  doc.text(
    new Date().toLocaleDateString('es-VE', { year: 'numeric', month: '2-digit', day: '2-digit' }),
    pw - 40, 58, { align: 'right' },
  )

  // ─── Client info ──────────────────────────────────────────────────────
  let y = 104

  doc.setFillColor(248, 249, 250)
  doc.rect(40, y, pw - 80, 44, 'F')

  doc.setFontSize(11)
  doc.setTextColor(...dark)
  doc.setFont('helvetica', 'bold')
  doc.text(client.name, 52, y + 17)

  doc.setFontSize(8)
  doc.setTextColor(...muted)
  doc.setFont('helvetica', 'normal')
  const clientInfo: string[] = []
  if (client.phone) clientInfo.push(`Tel: ${client.phone}`)
  if (client.email) clientInfo.push(`Email: ${client.email}`)
  if (client.address) clientInfo.push(`Dir: ${client.address}`)
  if (clientInfo.length > 0) {
    doc.text(clientInfo.join('  |  '), 52, y + 34)
  }

  y += 58

  // ─── No debt ──────────────────────────────────────────────────────────
  if (client.receivables.length === 0) {
    doc.setFontSize(13)
    doc.setTextColor(37, 99, 235)
    doc.setFont('helvetica', 'bold')
    doc.text('Sin deuda pendiente', pw / 2, y + 30, { align: 'center' })
  } else {
    // ─── One table: all invoices ────────────────────────────────────────
    const tableBody: (string | number)[][] = []

    client.receivables.forEach((r, i) => {
      const sale = r.sale
      const saleDate = sale.date
        ? new Date(sale.date).toLocaleDateString('es-VE', { year: 'numeric', month: '2-digit', day: '2-digit' })
        : ''
      const dueDateStr = r.dueDate
        ? new Date(r.dueDate).toLocaleDateString('es-VE', { year: 'numeric', month: '2-digit', day: '2-digit' })
        : ''

      // Products as a comma-separated list
      const products = sale.lines.map(l => l.product.name).join(', ')

      tableBody.push([
        String(i + 1),
        saleDate,
        products,
        `${symbol}${fmt(r.amount)}`,
        `${symbol}${fmt(r.pendingBalance)}`,
        dueDateStr,
      ])
    })

    autoTable(doc, {
      startY: y,
      theme: 'striped',
      margin: { left: 40, right: 40 },
      head: [['#', 'Fecha', 'Productos', 'Monto', 'Pendiente', 'Vence']],
      body: tableBody,
      styles: {
        fontSize: 9,
        cellPadding: 5,
        lineColor: [209, 213, 219],
        lineWidth: 0.5,
      },
      headStyles: {
        fillColor: blue,
        textColor: white,
        fontStyle: 'bold',
        fontSize: 9,
      },
      columnStyles: {
        0: { cellWidth: 25, halign: 'center' },
        1: { cellWidth: 80 },
        2: { cellWidth: 190 },
        3: { cellWidth: 70, halign: 'right' },
        4: { cellWidth: 70, halign: 'right' },
        5: { cellWidth: 65, halign: 'center' },
      },
      didParseCell: (data) => {
        // Bold the last (total) row
        if (data.section === 'body' && data.row.index === tableBody.length - 1) {
          data.cell.styles.fillColor = [254, 242, 242]
          data.cell.styles.fontStyle = 'bold'
          data.cell.styles.textColor = [220, 38, 38]
        }
      },
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 20

    // ─── Total box ─────────────────────────────────────────────────────
    doc.setFillColor(254, 242, 242)
    doc.rect(40, y, pw - 80, 36, 'F')
    doc.setFillColor(220, 38, 38)
    doc.rect(40, y, 4, 36, 'F')

    doc.setFontSize(11)
    doc.setTextColor(220, 38, 38)
    doc.setFont('helvetica', 'bold')
    doc.text('TOTAL DEUDA PENDIENTE', 56, y + 23)

    doc.setFontSize(16)
    doc.text(`${symbol}${fmt(totalDebt)}`, pw - 52, y + 23, { align: 'right' })

    y += 36

    // ─── Exchange rate ─────────────────────────────────────────────────
    if (exchangeRate > 0) {
      doc.setFontSize(8)
      doc.setTextColor(...muted)
      doc.setFont('helvetica', 'normal')
      doc.text(
        `Tasa: 1 ${referenceCurrency} = ${fmt(exchangeRate)} Bs  |  Equivalente: ${fmt(totalDebt * exchangeRate)} Bs`,
        pw / 2, y + 16, { align: 'center' },
      )
    }
  }

  // ─── Footer ──────────────────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)

    doc.setDrawColor(209, 213, 219)
    doc.setLineWidth(0.3)
    doc.line(40, ph - 30, pw - 40, ph - 30)

    doc.setFontSize(7)
    doc.setTextColor(...muted)
    doc.setFont('helvetica', 'normal')
    doc.text(
      `${businessName} \u2014 Estado de Cuenta  |  Pagina ${i} de ${totalPages}`,
      pw / 2, ph - 16, { align: 'center' },
    )
  }

  return Buffer.from(doc.output('arraybuffer'))
}
