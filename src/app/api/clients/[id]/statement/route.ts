import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clientId } = await params

    const [settings, client] = await Promise.all([
      db.settings.findFirst(),
      db.client.findUnique({
        where: { id: clientId },
        include: {
          receivables: {
            where: { status: 'pendiente' },
            include: {
              sale: {
                include: {
                  lines: { include: { product: { select: { name: true, sku: true } } } },
                  payments: { include: { currency: { select: { code: true, symbol: true } } } },
                  user: { select: { name: true } },
                  branch: { select: { name: true } },
                },
              },
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      }),
    ])

    if (!client) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
    }

    const businessName = settings?.businessName || 'Mi Empresa'
    const rif = settings?.rif || ''
    const address = settings?.address || ''
    const phone = settings?.phone || ''
    const businessEmail = settings?.email || ''
    const exchangeRate = settings?.exchangeRate || 0
    const referenceCurrency = settings?.referenceCurrency || 'USD'

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

      // ─── Receivables Table ──────────────────────────────────────────────
      const tableBody = client.receivables.map((r, i) => {
        const sale = r.sale
        const saleDate = sale.date
          ? new Date(sale.date).toLocaleDateString('es-VE', { year: 'numeric', month: '2-digit', day: '2-digit' })
          : ''
        const dueDateStr = r.dueDate
          ? new Date(r.dueDate).toLocaleDateString('es-VE', { year: 'numeric', month: '2-digit', day: '2-digit' })
          : '—'
        const productsList = sale.lines.map(l => l.product.name).join(', ')
        const truncatedProducts = productsList.length > 40 ? productsList.substring(0, 40) + '...' : productsList

        return [
          String(i + 1),
          saleDate,
          truncatedProducts,
          `${symbol}${fmt(r.amount)}`,
          `${symbol}${fmt(r.pendingBalance)}`,
          dueDateStr,
        ]
      })

      // Total row
      tableBody.push([
        '',
        '',
        { content: 'TOTAL', styles: { fontStyle: 'bold', textColor: redAccent } },
        { content: `${symbol}${fmt(client.receivables.reduce((s, r) => s + r.amount, 0))}`, styles: { fontStyle: 'bold', halign: 'right' } },
        { content: `${symbol}${fmt(totalDebt)}`, styles: { fontStyle: 'bold', textColor: redAccent, halign: 'right' } },
        '',
      ])

      autoTable(doc, {
        startY: y,
        theme: 'grid',
        margin: { left: 40, right: 40 },
        head: [['#', 'Fecha', 'Productos', 'Monto', 'Pendiente', 'Vence']],
        body: tableBody,
        styles: {
          fontSize: 8,
          cellPadding: 4,
        },
        headStyles: {
          fillColor: blueHeader,
          textColor: C_white,
          fontStyle: 'bold',
          fontSize: 8,
        },
        columnStyles: {
          0: { cellWidth: 25 },
          1: { cellWidth: 75 },
          2: { cellWidth: 150 },
          3: { halign: 'right', cellWidth: 70 },
          4: { halign: 'right', cellWidth: 70 },
          5: { halign: 'center', cellWidth: 60 },
        },
        didParseCell: (data) => {
          if (data.section === 'body' && data.row.index === tableBody.length - 1) {
            data.cell.styles.fillColor = [254, 242, 242]
          }
        },
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      y = (doc as any).lastAutoTable.finalY + 16

      // ─── Detail per receivable ──────────────────────────────────────────
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
        doc.text(`Factura No ${saleNum}  |  ${saleDate}  |  Sucursal: ${sale.branch?.name || '—'}  |  Cajero: ${sale.user?.name || '—'}`, 50, y + 13)
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
    }

    // ─── Exchange rate ───────────────────────────────────────────────────
    if (exchangeRate > 0 && totalDebt > 0) {
      const totalBs = totalDebt * exchangeRate
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lastY = (doc as any).lastAutoTable?.finalY || y
      doc.setFontSize(8)
      doc.setTextColor(...mutedText)
      doc.setFont('helvetica', 'normal')
      doc.text(
        `Tasa de cambio: 1 ${referenceCurrency} = ${fmt(exchangeRate)} Bs  |  Deuda total: ${fmt(totalBs, 2)} Bs`,
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

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'))

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="estado_cuenta_${client.name.replace(/\s+/g, '_')}.pdf"`,
      },
    })
  } catch (error) {
    console.error('Error generando estado de cuenta PDF:', error)
    return NextResponse.json(
      { error: 'Error al generar el estado de cuenta' },
      { status: 500 }
    )
  }
}
