import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { getPermissions } from '@/lib/permissions'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// GET /api/reports/clients/pdf?source=nuevo&status=Activo&agreementName=ConvenioX&promotionName=PromoY&dateFrom=2025-07-01&dateTo=2025-07-15&planType=dias&branchId=xxx
export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if ('status' in auth) return auth

  const perms = getPermissions(auth.role)
  if (!perms.canManageClients && auth.role !== 'admin' && auth.role !== 'gerente') {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)

  // Filters (all optional)
  const source = searchParams.get('source') || undefined
  const status = searchParams.get('status') || undefined
  const agreementName = searchParams.get('agreementName') || undefined
  const promotionName = searchParams.get('promotionName') || undefined
  const dateFrom = searchParams.get('dateFrom') || undefined
  const dateTo = searchParams.get('dateTo') || undefined
  const planType = searchParams.get('planType') || undefined
  const branchId = searchParams.get('branchId') || undefined

  try {
    const data = await buildClientReportData({
      source,
      status,
      agreementName,
      promotionName,
      dateFrom,
      dateTo,
      planType,
      branchId,
    })

    const settings = await db.settings.findFirst({
      select: { businessName: true, rif: true, address: true, phone: true },
    })
    const businessName = settings?.businessName || 'JO-Administrativo'

    const pdfBuffer = generateClientsPDF(data, businessName)

    const filename = `reporte_clientes_${dateFrom || 'todos'}_${dateTo || 'todos'}.pdf`

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error('[ClientsReportPDF GET]', error)
    return NextResponse.json({ error: 'Error al generar PDF de clientes' }, { status: 500 })
  }
}

// ─── Data Builder ────────────────────────────────────────────────────────────

interface ClientReportRow {
  nombre: string
  apellido: string
  cedula: string
  telefono: string
  email: string
  origen: string
  convenio: string
  promocion: string
  registradoEl: Date
  membresiaEstado: string
  tipoPlan: string
  plan: string
  totalVentas: number
  totalDeuda: number
}

interface ClientReportData {
  clients: ClientReportRow[]
  summary: {
    totalClientes: number
    conMembresiaActiva: number
    conDeuda: number
    porOrigen: Record<string, number>
    porTipoPlan: Record<string, number>
  }
  filtros: {
    source?: string
    status?: string
    agreementName?: string
    promotionName?: string
    dateFrom?: string
    dateTo?: string
    planType?: string
    branchId?: string
  }
}

async function buildClientReportData(filters: {
  source?: string
  status?: string
  agreementName?: string
  promotionName?: string
  dateFrom?: string
  dateTo?: string
  planType?: string
  branchId?: string
}): Promise<ClientReportData> {
  const { source, status, agreementName, promotionName, dateFrom, dateTo, planType, branchId } = filters

  const where: Record<string, unknown>[] = [{ deletedAt: null }]

  if (source) where.push({ source })
  if (agreementName) where.push({ agreementName })
  if (promotionName) where.push({ promotionName })
  if (planType) where.push({ memberships: { some: { planType } } })
  if (status) where.push({ memberships: { some: { status } } })
  if (branchId) {
    where.push({ sales: { some: { branchId } } })
  }
  if (dateFrom || dateTo) {
    const dateFilter: Record<string, unknown> = {}
    if (dateFrom) dateFilter.gte = new Date(dateFrom + 'T00:00:00')
    if (dateTo) dateFilter.lte = new Date(dateTo + 'T23:59:59.999')
    where.push({ createdAt: dateFilter })
  }

  const baseWhere = { AND: where }

  const clients = await db.client.findMany({
    where: baseWhere,
    select: {
      id: true,
      name: true,
      lastName: true,
      cedula: true,
      phone: true,
      email: true,
      source: true,
      agreementName: true,
      promotionName: true,
      createdAt: true,
      memberships: {
        select: {
          status: true,
          planType: true,
          tarifa: true,
          plan: { select: { name: true } },
        },
        where: { status: { in: ['Activo', 'Vencido'] } },
        orderBy: { createdAt: 'desc' },
      },
      _count: {
        select: {
          sales: true,
          receivables: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Summary counters
  let conMembresiaActiva = 0
  let conDeuda = 0
  const porOrigen: Record<string, number> = {}
  const porTipoPlan: Record<string, number> = {}

  const rows: ClientReportRow[] = clients.map((c) => {
    const gymM = c.memberships.find(m => m.planType !== 'tickets') || null
    const ticketM = c.memberships.find(m => m.planType === 'tickets') || null
    const m = gymM || ticketM // primary for display
    const isActive = gymM?.status === 'Activo' || ticketM?.status === 'Activo'

    if (isActive) conMembresiaActiva++
    if (c._count.receivables > 0) conDeuda++

    // Origen counter
    const origen = c.source || 'Sin origen'
    porOrigen[origen] = (porOrigen[origen] || 0) + 1

    // Plan type counter
    if (m?.planType) {
      porTipoPlan[m.planType] = (porTipoPlan[m.planType] || 0) + 1
    }

    return {
      nombre: c.name,
      apellido: c.lastName || '',
      cedula: c.cedula || '',
      telefono: c.phone || '',
      email: c.email || '',
      origen,
      convenio: c.agreementName || '',
      promocion: c.promotionName || '',
      registradoEl: c.createdAt,
      membresiaEstado: m?.status || 'Sin membresía',
      tipoPlan: m?.planType || '',
      plan: m?.plan?.name || '',
      totalVentas: c._count.sales,
      totalDeuda: c._count.receivables,
    }
  })

  return {
    clients: rows,
    summary: {
      totalClientes: clients.length,
      conMembresiaActiva,
      conDeuda,
      porOrigen,
      porTipoPlan,
    },
    filtros: filters,
  }
}

// ─── PDF Generation ──────────────────────────────────────────────────────────

function generateClientsPDF(
  data: ClientReportData,
  businessName: string
): Buffer {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' })
  const pw = doc.internal.pageSize.getWidth()
  const ph = doc.internal.pageSize.getHeight()
  const margin = 30
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
  doc.text('Reporte de Clientes', pw / 2, y, { align: 'center' })
  y += 22

  // Sub-header info
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(107, 114, 128)

  const activeFilters: string[] = []
  if (data.filtros.dateFrom && data.filtros.dateTo) {
    activeFilters.push(`Período: ${data.filtros.dateFrom} al ${data.filtros.dateTo}`)
  }
  if (data.filtros.source) activeFilters.push(`Origen: ${data.filtros.source}`)
  if (data.filtros.status) activeFilters.push(`Estado: ${data.filtros.status}`)
  if (data.filtros.agreementName) activeFilters.push(`Convenio: ${data.filtros.agreementName}`)
  if (data.filtros.promotionName) activeFilters.push(`Promoción: ${data.filtros.promotionName}`)
  if (data.filtros.planType) activeFilters.push(`Tipo de Plan: ${data.filtros.planType}`)
  if (data.filtros.branchId) activeFilters.push(`Sucursal: ${data.filtros.branchId}`)

  if (activeFilters.length > 0) {
    doc.text('Filtros: ' + activeFilters.join(' | '), margin, y)
    y += 14
  }

  doc.text(`Generado: ${new Date().toLocaleString('es-VE')}`, margin, y)
  y += 18

  // ── Summary Boxes ──
  const boxW = contentW / 4 - 8
  const boxes = [
    { label: 'Total Clientes', value: String(data.summary.totalClientes) },
    { label: 'Membresía Activa', value: String(data.summary.conMembresiaActiva) },
    { label: 'Con Deuda', value: String(data.summary.conDeuda) },
    { label: 'Tipos de Plan', value: String(Object.keys(data.summary.porTipoPlan).length) },
  ]

  for (let i = 0; i < boxes.length; i++) {
    const bx = margin + i * (boxW + 10)
    doc.setFillColor(248, 250, 252)
    doc.roundedRect(bx, y, boxW, 32, 4, 4, 'F')
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(107, 114, 128)
    doc.text(boxes[i].label, bx + 8, y + 12)
    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(17, 24, 39)
    doc.text(boxes[i].value, bx + 8, y + 26)
  }
  y += 42

  // ── Main Clients Table ──
  const headers = [
    ['Nombre', 'Cédula', 'Teléfono', 'Email', 'Origen', 'Convenio', 'Membresía', 'Tipo Plan', 'Ventas', 'Deuda'],
  ]

  const tableBody = data.clients.map((c) => [
    [c.nombre, c.apellido].filter(Boolean).join(' '),
    c.cedula,
    c.telefono,
    c.email,
    c.origen,
    c.convenio,
    c.membresiaEstado,
    c.tipoPlan || '—',
    String(c.totalVentas),
    String(c.totalDeuda),
  ])

  autoTable(doc, {
    startY: y,
    head: headers,
    body: tableBody,
    margin: { left: margin, right: margin, bottom: margin },
    styles: {
      fontSize: 7,
      cellPadding: 3,
      textColor: [17, 24, 39],
      lineColor: [229, 231, 235],
      lineWidth: 0.5,
    },
    headStyles: {
      fillColor: [31, 41, 55],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7,
      halign: 'center',
    },
    columnStyles: {
      0: { cellWidth: 110 },
      1: { cellWidth: 80, halign: 'center' },
      2: { cellWidth: 90, halign: 'center' },
      3: { cellWidth: 100 },
      4: { cellWidth: 70, halign: 'center' },
      5: { cellWidth: 70 },
      6: { cellWidth: 80, halign: 'center' },
      7: { cellWidth: 60, halign: 'center' },
      8: { cellWidth: 40, halign: 'center' },
      9: { cellWidth: 40, halign: 'center' },
    },
    alternateRowStyles: {
      fillColor: [249, 250, 251],
    },
    didParseCell(tableData) {
      // Highlight membership status
      if (tableData.section === 'body' && tableData.column.index === 6) {
        const val = String(tableData.cell.raw)
        if (val === 'Activo') {
          tableData.cell.styles.textColor = [5, 150, 105]
          tableData.cell.styles.fontStyle = 'bold'
        } else if (val === 'Vencido') {
          tableData.cell.styles.textColor = [220, 38, 38]
          tableData.cell.styles.fontStyle = 'bold'
        }
      }
      // Highlight debt count
      if (tableData.section === 'body' && tableData.column.index === 9) {
        const val = parseInt(String(tableData.cell.raw), 10)
        if (val > 0) {
          tableData.cell.styles.textColor = [220, 38, 38]
          tableData.cell.styles.fontStyle = 'bold'
        }
      }
    },
  })

  // ── Summary: Origen breakdown ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let lastY = (doc as any).lastAutoTable.finalY + 16

  // Check if we need a new page for summaries
  const neededSpace = 80
  if (lastY + neededSpace > ph - 50) {
    doc.addPage()
    lastY = margin
  }

  // Origen summary
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(31, 41, 55)
  doc.text('Resumen por Origen', margin, lastY)
  lastY += 4

  doc.setDrawColor(31, 41, 55)
  doc.setLineWidth(0.5)
  doc.line(margin, lastY, margin + contentW * 0.45, lastY)
  lastY += 8

  const origenEntries = Object.entries(data.summary.porOrigen).sort((a, b) => b[1] - a[1])
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(55, 65, 81)

  for (const [origen, count] of origenEntries) {
    const pct = data.summary.totalClientes > 0
      ? ((count / data.summary.totalClientes) * 100).toFixed(1)
      : '0.0'
    doc.text(`• ${origen}: ${count} (${pct}%)`, margin + 10, lastY)
    lastY += 14
  }

  // Plan type summary (right side)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const summaryStartY = (doc as any).lastAutoTable.finalY + 16

  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(31, 41, 55)
  doc.text('Resumen por Tipo de Plan', pw / 2 + 20, summaryStartY)
  const planLineY = summaryStartY + 4
  doc.setDrawColor(31, 41, 55)
  doc.line(pw / 2 + 20, planLineY, pw - margin, planLineY)

  let planY = summaryStartY + 12
  const planEntries = Object.entries(data.summary.porTipoPlan).sort((a, b) => b[1] - a[1])
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(55, 65, 81)

  for (const [tipo, count] of planEntries) {
    const pct = data.summary.totalClientes > 0
      ? ((count / data.summary.totalClientes) * 100).toFixed(1)
      : '0.0'
    const labelMap: Record<string, string> = { dias: 'Días', horario: 'Horario', tickets: 'Tickets' }
    const label = labelMap[tipo] || tipo
    doc.text(`• ${label}: ${count} (${pct}%)`, pw / 2 + 30, planY)
    planY += 14
  }

  // ── Page footers ──
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    const pageH = doc.internal.pageSize.getHeight()
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(156, 163, 175)
    doc.text(
      `Generado por JO-Administrativo — Página ${i} de ${pageCount}`,
      pw / 2,
      pageH - 15,
      { align: 'center' }
    )
  }

  return Buffer.from(doc.output('arraybuffer'))
}
