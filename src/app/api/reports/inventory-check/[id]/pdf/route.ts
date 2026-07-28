import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { getPermissions } from '@/lib/permissions'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// GET /api/reports/inventory-check/[id]/pdf — Generate PDF for an inventory check
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    if ('status' in auth) return auth

    const { id } = await params

    const check = await db.inventoryCheck.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true } },
          },
          orderBy: { productName: 'asc' },
        },
      },
    })

    if (!check) {
      return NextResponse.json({ error: 'Conteo de inventario no encontrado' }, { status: 404 })
    }

    // Cajero solo puede ver sus propios conteos
    if (auth.role === 'cajero' && check.userId !== auth.userId) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    const settings = await db.settings.findFirst()
    const businessName = settings?.businessName || 'JO-Administrativo'

    const pdfBuffer = generateInventoryCheckPDF(check, businessName)

    const filename = `conteo_inventario_${check.branch.name}_${check.checkDate.toISOString().slice(0, 10)}.pdf`

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error('[GET inventory-check/:id/pdf]', error)
    return NextResponse.json({ error: 'Error al generar PDF del conteo' }, { status: 500 })
  }
}

// ─── PDF Generation ──────────────────────────────────────────────────────────

function generateInventoryCheckPDF(
  check: {
    id: string
    checkDate: Date
    status: string
    notes: string | null
    user: { name: string }
    branch: { name: string }
    items: {
      productName: string
      initialStock: number
      verifiedStock: number
      unitPrice: number
      discrepancyQty: number
      discrepancyAmt: number
      notes: string | null
      product: { sku: string | null } | null
    }[]
  },
  businessName: string
): Uint8Array {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' })

  const pageW = doc.internal.pageSize.getWidth()
  const margin = 40
  const contentW = pageW - margin * 2

  let y = margin

  // ── Header ──
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(17, 24, 39)
  doc.text(businessName, pageW / 2, y, { align: 'center' })
  y += 28

  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text('Conteo de Inventario', pageW / 2, y, { align: 'center' })
  y += 24

  // Sub-header info
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(107, 114, 128)
  const dateStr = check.checkDate.toLocaleDateString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  doc.text(`Fecha: ${dateStr}`, margin, y)
  doc.text(`Sucursal: ${check.branch.name}`, pageW - margin, y, { align: 'right' })
  y += 16
  doc.text(`Cajero: ${check.user.name}`, margin, y)
  doc.text(`Estado: ${check.status === 'verificado' ? 'Verificado' : 'Pendiente'}`, pageW - margin, y, { align: 'right' })
  y += 20

  // ── Table ──
  const tableBody = check.items.map(item => [
    item.productName,
    formatNumber(item.initialStock),
    formatNumber(item.verifiedStock),
    formatNumber(item.discrepancyQty),
    formatCurrency(item.discrepancyAmt),
    item.notes || '',
  ])

  autoTable(doc, {
    startY: y,
    head: [['Producto', 'Stock Inicial', 'Stock Verificado', 'Diferencia (qty)', 'Diferencia ($)', 'Novedades']],
    body: tableBody,
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
      1: { halign: 'center' },
      2: { halign: 'center' },
      3: { halign: 'center' },
      4: { halign: 'right' },
    },
    alternateRowStyles: {
      fillColor: [249, 250, 251],
    },
    didParseCell(data: { section: string; column: { index: number }; cell: { styles: { textColor: number[] } }; row: { raw: number[] } }) {
      // Highlight discrepancies in red
      if (data.section === 'body' && data.column.index === 3) {
        const val = data.row.raw[3] as number
        if (val < 0) {
          data.cell.styles.textColor = [220, 38, 38] // red-600
        } else if (val > 0) {
          data.cell.styles.textColor = [22, 163, 74] // green-600
        }
      }
      if (data.section === 'body' && data.column.index === 4) {
        const val = data.row.raw[4] as number
        if (val < 0) {
          data.cell.styles.textColor = [220, 38, 38]
        } else if (val > 0) {
          data.cell.styles.textColor = [22, 163, 74]
        }
      }
    },
  })

  // ── Totals Footer ──
  const finalY = (doc as any).lastAutoTable.finalY + 16

  const totalDiscrepancyAmt = check.items.reduce(
    (sum, item) => sum + item.discrepancyAmt, 0
  )
  const totalPositiveAmt = check.items.filter(i => i.discrepancyAmt > 0).reduce((s, i) => s + i.discrepancyAmt, 0)
  const totalNegativeAmt = check.items.filter(i => i.discrepancyAmt < 0).reduce((s, i) => s + i.discrepancyAmt, 0)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(17, 24, 39)
  doc.text('Resumen de Diferencias:', margin, finalY)
  doc.text(`Total Diferencia ($): ${formatCurrency(totalDiscrepancyAmt)}`, pageW - margin, finalY, { align: 'right' })

  if (totalPositiveAmt > 0) {
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(22, 163, 74)
    doc.text(`Sobrantes: +${formatCurrency(totalPositiveAmt)}`, margin, finalY + 14)
  }

  if (totalNegativeAmt < 0) {
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(220, 38, 38)
    const xPos = totalPositiveAmt > 0 ? pageW / 2 : margin
    doc.text(`Faltantes: ${formatCurrency(totalNegativeAmt)}`, xPos, finalY + 14)
  }

  // ── Notes Section ──
  if (check.notes) {
    const notesY = finalY + 32
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(107, 114, 128)
    doc.text('Notas:', margin, notesY)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(55, 65, 81)
    const splitNotes = doc.splitTextToSize(check.notes, contentW)
    doc.text(splitNotes, margin, notesY + 14)
  }

  // ── Page footer ──
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    const pageH = doc.internal.pageSize.getHeight()
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(156, 163, 175)
    doc.text(
      `Generado por JO-Administrativo — Página ${i} de ${pageCount}`,
      pageW / 2,
      pageH - 20,
      { align: 'center' }
    )
  }

  return new Uint8Array(doc.output('arraybuffer'))
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  return n.toLocaleString('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function formatCurrency(n: number): string {
  return `$${n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
