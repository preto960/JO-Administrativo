import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { fetchAppTz, fetchToday } from '@/lib/tz-helpers'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const COLOR_MAP: Record<string, number[]> = {
  emerald: [5, 150, 105],
  blue: [37, 99, 235],
  purple: [124, 58, 237],
  rose: [244, 63, 94],
  orange: [234, 88, 12],
  teal: [13, 148, 136],
  cyan: [6, 182, 212],
  indigo: [79, 70, 229],
  pink: [236, 72, 153],
  amber: [217, 119, 6],
  lime: [101, 163, 13],
  red: [220, 38, 38],
  sky: [14, 165, 233],
  fuchsia: [192, 38, 211],
  slate: [71, 85, 105],
  zinc: [82, 82, 91],
  stone: [87, 83, 78],
  neutral: [82, 82, 91],
}

function hexToRgb(hex: string): number[] | null {
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i)
  if (!m) return null
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
}

function resolveColor(primaryColor: string): number[] {
  return COLOR_MAP[primaryColor] || hexToRgb(primaryColor) || [37, 99, 235]
}

function formatCedula(c: string): string {
  const digits = c.replace(/\D/g, '')
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if ('status' in auth) return auth

  try {
    const { searchParams } = new URL(request.url)
    const dateParam = searchParams.get('date') // format: YYYY-MM-DD

    const settings = await db.settings.findFirst()
    const businessName = settings?.businessName || 'Mi Empresa'
    const logoUrl = settings?.logoUrl || ''
    const address = settings?.address || ''
    const phone = settings?.phone || ''
    const email = settings?.email || ''
    const rif = settings?.rif || ''
    const primaryColor = resolveColor(settings?.primaryColor || 'blue')
    const appTz = await fetchAppTz()

    // Use provided date or default to today
    let targetDate: Date
    let targetDateStr: string
    if (dateParam) {
      // Parse the date string as local date in the app timezone
      const [y, m, d] = dateParam.split('-').map(Number)
      targetDate = new Date(y, m - 1, d)
      targetDateStr = dateParam
    } else {
      targetDate = await fetchToday(appTz.timezone)
      targetDateStr = new Date().toLocaleDateString('en-CA', { timeZone: appTz.timezone })
    }

    const nextDay = new Date(targetDate)
    nextDay.setDate(nextDay.getDate() + 1)

    const now = new Date()
    const h = parseInt(now.toLocaleString('en-US', { timeZone: appTz.timezone, hour: 'numeric', hour12: false }))
    const m = now.toLocaleString('en-US', { timeZone: appTz.timezone, minute: '2-digit' })
    const ampm = h >= 12 ? 'pm' : 'am'
    const h12 = h % 12 || 12
    const timeStr = `${h12}:${m} ${ampm}`

    const clients = await db.client.findMany({
      where: {
        deletedAt: null,
        memberships: {
          some: {
            endDate: { gte: targetDate, lt: nextDay },
            status: { in: ['Vencido', 'Activo'] },
          },
        },
      },
      select: {
        name: true,
        lastName: true,
        cedula: true,
        email: true,
        phone: true,
        memberships: {
          where: { endDate: { gte: targetDate, lt: nextDay } },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { tarifa: true, endDate: true, daysRemaining: true },
        },
      },
      orderBy: { name: 'asc' },
    })

    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' })
    const pw = doc.internal.pageSize.getWidth()
    let y = 0

    doc.setFillColor(...primaryColor)
    doc.rect(0, 0, pw, 90, 'F')

    let logoDrawn = false
    if (logoUrl) {
      try {
        const logoRes = await fetch(logoUrl)
        if (logoRes.ok) {
          const logoBuf = Buffer.from(await logoRes.arrayBuffer())
          const base64 = `data:image/png;base64,${logoBuf.toString('base64')}`
          doc.addImage(base64, 'PNG', 40, 15, 60, 60)
          logoDrawn = true
        }
      } catch { /* skip logo */ }
    }

    const textX = logoDrawn ? 115 : 40
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.text('INFORME CLIENTES PAGOS VENCIDOS', textX, 40)

    // If querying a specific date (not today), show it in the title
    if (dateParam) {
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.text(`Vencimientos del: ${targetDateStr}`, textX, 55)
      doc.text(`Hora de descarga: ${timeStr}`, textX, 70)
    } else {
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.text(`Fecha de Expedici\u00f3n: ${targetDateStr}`, textX, 58)
      doc.text(`Hora: ${timeStr}`, textX, 73)
    }

    y = 100
    doc.setFillColor(245, 247, 250)
    doc.rect(30, y, pw - 60, 25, 'F')
    doc.setTextColor(60, 60, 60)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text(businessName, 40, y + 16)
    if (rif) doc.text(`NIT: ${rif}`, 250, y + 16)
    doc.setFont('helvetica', 'normal')
    if (address) doc.text(address, 420, y + 16)

    y = 135
    const tableBody = clients.map((c, i) => [
      i + 1,
      formatCedula(c.cedula || ''),
      `${c.name}${c.lastName ? ' ' + c.lastName : ''}`,
      c.phone || '',
      c.email || '',
      c.memberships[0]?.tarifa || '',
      c.memberships[0]?.endDate ? new Date(c.memberships[0].endDate).toLocaleDateString('en-CA', { timeZone: appTz.timezone }) : '',
      c.memberships[0]?.daysRemaining ?? 0,
    ])

    autoTable(doc, {
      startY: y,
      margin: { left: 30, right: 30 },
      theme: 'grid',
      head: [['#', 'CEDULA', 'NOMBRE', 'CELULAR', 'CORREO', 'TARIFA', 'F. VENCIMIENTO', 'DIAS RESTANTES']],
      body: tableBody,
      headStyles: {
        fillColor: primaryColor,
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: 'bold',
        halign: 'center',
        cellPadding: 5,
      },
      bodyStyles: {
        fontSize: 7.5,
        cellPadding: 4,
        textColor: [40, 40, 40],
      },
      columnStyles: {
        0: { cellWidth: 25, halign: 'center' },
        1: { cellWidth: 80 },
        2: { cellWidth: 110 },
        3: { cellWidth: 75 },
        4: { cellWidth: 90 },
        5: { cellWidth: 70 },
        6: { cellWidth: 65, halign: 'center' },
        7: { cellWidth: 40, halign: 'center' },
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
    })

    const totalPages = doc.getNumberOfPages()
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i)
      const ph = doc.internal.pageSize.getHeight()
      doc.setFontSize(7)
      doc.setTextColor(140, 140, 140)
      doc.text(`(Pagina ${i} de ${totalPages})`, pw / 2, ph - 20, { align: 'center' })
      doc.text(`${businessName} ${rif ? '- NIT: ' + rif : ''} ${address ? '- ' + address : ''}`, pw / 2, ph - 10, { align: 'center' })
    }

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'))
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="Informe_Vencidos_${targetDateStr}.pdf"`,
      },
    })
  } catch (error) {
    console.error('[ExpiredTodayPDF]', error)
    return NextResponse.json({ error: 'Error al generar PDF' }, { status: 500 })
  }
}