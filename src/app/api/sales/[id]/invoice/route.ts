import PDFDocument from 'pdfkit'
import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: saleId } = await params

    const [settings, sale] = await Promise.all([
      db.settings.findFirst(),
      db.sale.findUnique({
        where: { id: saleId },
        include: {
          lines: {
            include: {
              product: { select: { name: true, sku: true } },
            },
          },
          client: { select: { name: true, phone: true, email: true, address: true } },
          user: { select: { name: true } },
          branch: { select: { name: true } },
          payments: {
            include: { currency: { select: { code: true, symbol: true } } },
          },
          receivables: true,
        },
      }),
    ])

    if (!sale) {
      return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 })
    }

    const businessName = settings?.businessName || 'Mi Empresa'
    const rif = settings?.rif || ''
    const address = settings?.address || ''
    const phone = settings?.phone || ''
    const businessEmail = settings?.email || ''

    const hasReceivable = sale.receivables && sale.receivables.length > 0
    const receivable = hasReceivable ? sale.receivables[0] : null
    const invoiceTitle = hasReceivable ? 'NOTA DE DESPACHO' : 'FACTURA'

    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 20, bottom: 40, left: 40, right: 40 },
      bufferPages: true,
    })

    doc.registerFont('Regular', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
    doc.registerFont('Bold', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')

    const buffers: Buffer[] = []
    doc.on('data', (chunk: Buffer) => buffers.push(chunk))

    const pdfPromise = new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(buffers)))
    })

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right
    const blueHeader = '#1a3a6b'
    const accentBlue = '#2563eb'
    const lightGray = '#f3f4f6'
    const darkText = '#1f2937'
    const mutedText = '#6b7280'

    // ─── Blue Header Band ───
    doc.rect(0, 0, doc.page.width, 110).fill(blueHeader)

    // Company name
    doc.font('Bold').fontSize(20).fillColor('#ffffff')
    doc.text(businessName, 40, 20, { width: pageWidth })

    // Company details
    doc.font('Regular').fontSize(9).fillColor('#d1d5db')
    let detailY = 48
    if (rif) {
      doc.text(`RIF: ${rif}`, 40, detailY)
      detailY += 14
    }
    if (address) {
      doc.text(`Dirección: ${address}`, 40, detailY)
      detailY += 14
    }
    if (phone) {
      doc.text(`Teléfono: ${phone}`, 40, detailY)
      detailY += 14
    }
    if (businessEmail) {
      doc.text(`Email: ${businessEmail}`, 40, detailY)
    }

    // Invoice number & title (right side of header)
    doc.font('Bold').fontSize(14).fillColor('#ffffff')
    doc.text(invoiceTitle, 40, 72, { align: 'right', width: pageWidth })

    const invoiceNumber = sale.id.substring(0, 8).toUpperCase()
    doc.font('Regular').fontSize(10).fillColor('#93c5fd')
    doc.text(`N° ${invoiceNumber}`, 40, 92, { align: 'right', width: pageWidth })

    // ─── Invoice Meta Info ───
    let y = 125

    // Two-column info boxes
    const boxHeight = 60

    // Left box: Date & Branch
    doc.roundedRect(40, y, pageWidth / 2 - 5, boxHeight, 4).fill(lightGray)
    doc.font('Bold').fontSize(8).fillColor(mutedText)
    doc.text('FECHA', 50, y + 8)
    doc.font('Regular').fontSize(10).fillColor(darkText)
    const saleDate = sale.date
      ? new Date(sale.date).toLocaleDateString('es-VE', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
      : ''
    doc.text(saleDate, 50, y + 22)

    if (sale.branch) {
      doc.font('Bold').fontSize(8).fillColor(mutedText)
      doc.text('SUCURSAL', 50, y + 38)
      doc.font('Regular').fontSize(10).fillColor(darkText)
      doc.text(sale.branch.name, 110, y + 38)
    }

    // Right box: Client info
    const rightX = 40 + pageWidth / 2 + 5
    doc.roundedRect(rightX, y, pageWidth / 2 - 5, boxHeight, 4).fill(lightGray)
    doc.font('Bold').fontSize(8).fillColor(mutedText)
    doc.text('CLIENTE', rightX + 10, y + 8)
    doc.font('Regular').fontSize(10).fillColor(darkText)
    const clientName = sale.client?.name || 'Consumidor Final'
    doc.text(clientName, rightX + 10, y + 22)

    if (sale.client?.phone) {
      doc.font('Regular').fontSize(8).fillColor(mutedText)
      doc.text(`Tel: ${sale.client.phone}`, rightX + 10, y + 38)
    }

    if (sale.user) {
      doc.font('Bold').fontSize(8).fillColor(mutedText)
      doc.text('CAJERO', rightX + 150, y + 38)
      doc.font('Regular').fontSize(8).fillColor(darkText)
      doc.text(sale.user.name, rightX + 200, y + 38)
    }

    y += boxHeight + 8

    // Client details block (if client has address/email)
    if (sale.client) {
      const clientDetails: string[] = []
      if (sale.client.email) clientDetails.push(`Email: ${sale.client.email}`)
      if (sale.client.address) clientDetails.push(`Dirección: ${sale.client.address}`)

      if (clientDetails.length > 0) {
        doc.roundedRect(40, y, pageWidth, 28, 4).fill('#eef2ff')
        doc.font('Regular').fontSize(8).fillColor(accentBlue)
        doc.text(clientDetails.join('  |  '), 50, y + 9, { width: pageWidth - 20 })
        y += 34
      }
    }

    // ─── Products Table ───
    const tableTop = y + 5
    const colWidths = {
      num: 30,
      product: pageWidth - 30 - 60 - 60 - 75 - 75 - 10,
      sku: 60,
      qty: 60,
      unitPrice: 75,
      total: 75,
    }
    const tableX = 40
    const rowHeight = 22

    // Table header
    doc.roundedRect(tableX, tableTop, pageWidth, rowHeight, 4).fill(blueHeader)
    doc.font('Bold').fontSize(8).fillColor('#ffffff')
    let colX = tableX + 5

    doc.text('#', colX, tableTop + 6, { width: colWidths.num })
    colX += colWidths.num
    doc.text('Producto', colX, tableTop + 6, { width: colWidths.product })
    colX += colWidths.product
    doc.text('SKU', colX, tableTop + 6, { width: colWidths.sku })
    colX += colWidths.sku
    doc.text('Cantidad', colX, tableTop + 6, { width: colWidths.qty, align: 'right' })
    colX += colWidths.qty
    doc.text('P. Unitario', colX, tableTop + 6, { width: colWidths.unitPrice, align: 'right' })
    colX += colWidths.unitPrice
    doc.text('Total', colX, tableTop + 6, { width: colWidths.total, align: 'right' })

    let currentY = tableTop + rowHeight + 2

    // Table rows
    const fmt = (n: number) =>
      n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

    sale.lines.forEach((line, index) => {
      // Check if we need a new page
      if (currentY + rowHeight > doc.page.height - doc.page.margins.bottom - 80) {
        doc.addPage()
        currentY = doc.page.margins.top

        // Repeat header on new page
        doc.roundedRect(tableX, currentY, pageWidth, rowHeight, 4).fill(blueHeader)
        doc.font('Bold').fontSize(8).fillColor('#ffffff')
        let hx = tableX + 5
        doc.text('#', hx, currentY + 6, { width: colWidths.num })
        hx += colWidths.num
        doc.text('Producto', hx, currentY + 6, { width: colWidths.product })
        hx += colWidths.product
        doc.text('SKU', hx, currentY + 6, { width: colWidths.sku })
        hx += colWidths.sku
        doc.text('Cantidad', hx, currentY + 6, { width: colWidths.qty, align: 'right' })
        hx += colWidths.qty
        doc.text('P. Unitario', hx, currentY + 6, { width: colWidths.unitPrice, align: 'right' })
        hx += colWidths.unitPrice
        doc.text('Total', hx, currentY + 6, { width: colWidths.total, align: 'right' })
        currentY += rowHeight + 2
      }

      // Alternating row background
      const rowBg = index % 2 === 0 ? '#ffffff' : lightGray
      doc.rect(tableX, currentY, pageWidth, rowHeight).fill(rowBg)

      // Subtle row bottom border
      doc.moveTo(tableX, currentY + rowHeight).lineTo(tableX + pageWidth, currentY + rowHeight)
      doc.strokeColor('#e5e7eb').lineWidth(0.5).stroke()

      doc.font('Regular').fontSize(8).fillColor(darkText)
      let cx = tableX + 5
      doc.text(`${index + 1}`, cx, currentY + 6, { width: colWidths.num })
      cx += colWidths.num

      doc.font('Bold').fontSize(8)
      doc.text(line.product.name, cx, currentY + 6, { width: colWidths.product })
      cx += colWidths.product

      doc.font('Regular').fontSize(8)
      doc.text(line.product.sku || '-', cx, currentY + 6, { width: colWidths.sku })
      cx += colWidths.sku
      doc.text(fmt(line.quantity), cx, currentY + 6, { width: colWidths.qty, align: 'right' })
      cx += colWidths.qty
      doc.text(fmt(line.unitPrice), cx, currentY + 6, { width: colWidths.unitPrice, align: 'right' })
      cx += colWidths.unitPrice
      doc.font('Bold').fontSize(8)
      doc.text(fmt(line.lineTotal), cx, currentY + 6, { width: colWidths.total, align: 'right' })

      currentY += rowHeight
    })

    // ─── Totals Section ───
    currentY += 8

    const totalsX = tableX + pageWidth - 200
    const labelW = 110
    const valueW = 90

    // Subtotal
    doc.font('Regular').fontSize(9).fillColor(mutedText)
    doc.text('Subtotal:', totalsX, currentY, { width: labelW, align: 'right' })
    doc.font('Regular').fontSize(9).fillColor(darkText)
    doc.text(fmt(sale.total), totalsX + labelW, currentY, { width: valueW, align: 'right' })
    currentY += 18

    // Total line
    doc.moveTo(totalsX, currentY).lineTo(totalsX + labelW + valueW, currentY)
    doc.strokeColor(accentBlue).lineWidth(1.5).stroke()
    currentY += 4

    doc.font('Bold').fontSize(12).fillColor(accentBlue)
    doc.text('TOTAL:', totalsX, currentY, { width: labelW, align: 'right' })
    doc.font('Bold').fontSize(12).fillColor(darkText)
    doc.text(fmt(sale.total), totalsX + labelW, currentY, { width: valueW, align: 'right' })
    currentY += 24

    // ─── Payment Methods ───
    if (sale.payments.length > 0) {
      // Check page break
      if (currentY + 60 > doc.page.height - doc.page.margins.bottom - 40) {
        doc.addPage()
        currentY = doc.page.margins.top
      }

      doc.roundedRect(40, currentY, pageWidth, 18, 3).fill(lightGray)
      doc.font('Bold').fontSize(8).fillColor(mutedText)
      doc.text('FORMA DE PAGO', 50, currentY + 4)
      currentY += 22

      sale.payments.forEach((payment) => {
        const methodLabel = payment.method.toUpperCase()
        const amountStr = fmt(payment.amount)
        const currencyInfo = payment.currency ? `${payment.currency.symbol} ${payment.currency.code}` : ''
        const reference = payment.reference ? ` — Ref: ${payment.reference}` : ''

        doc.font('Regular').fontSize(9).fillColor(darkText)
        doc.text(
          `${methodLabel}:  ${amountStr} ${currencyInfo}${reference}`,
          55,
          currentY
        )
        currentY += 16
      })

      currentY += 6
    }

    // ─── Credit / Receivables Notice ───
    if (hasReceivable && receivable) {
      if (currentY + 40 > doc.page.height - doc.page.margins.bottom - 40) {
        doc.addPage()
        currentY = doc.page.margins.top
      }

      const dueDateStr = receivable.dueDate
        ? new Date(receivable.dueDate).toLocaleDateString('es-VE', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          })
        : 'No definida'
      const pendingStr = fmt(receivable.pendingBalance)

      doc.roundedRect(40, currentY, pageWidth, 30, 4).fill('#fef2f2')
      doc.rect(40, currentY, 4, 30).fill('#dc2626')

      doc.font('Bold').fontSize(9).fillColor('#991b1b')
      doc.text('CRÉDITO', 54, currentY + 6)
      doc.font('Regular').fontSize(8).fillColor('#b91c1c')
      doc.text(`Vence: ${dueDateStr}  |  Saldo pendiente: ${pendingStr}`, 54, currentY + 17)

      currentY += 38
    }

    // ─── Footer ───
    const totalPages = doc.bufferedPageRange().count

    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i)

      const footerY = doc.page.height - 30

      // Footer line
      doc.moveTo(40, footerY - 5)
        .lineTo(doc.page.width - 40, footerY - 5)
        .strokeColor('#d1d5db').lineWidth(0.5).stroke()

      doc.font('Regular').fontSize(7).fillColor(mutedText)
      doc.text(
        `${businessName} — Generado el ${new Date().toLocaleDateString('es-VE')}`,
        40,
        footerY,
        { width: pageWidth, align: 'center' }
      )

      doc.font('Regular').fontSize(7).fillColor(mutedText)
      doc.text(
        `Factura N° ${invoiceNumber}  |  Página ${i + 1} de ${totalPages}`,
        40,
        footerY + 11,
        { width: pageWidth, align: 'center' }
      )
    }

    doc.end()

    const pdfBuffer = await pdfPromise

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="factura_${saleId}.pdf"`,
      },
    })
  } catch (error) {
    console.error('Error generando factura PDF:', error)
    return NextResponse.json(
      { error: 'Error al generar la factura' },
      { status: 500 }
    )
  }
}
