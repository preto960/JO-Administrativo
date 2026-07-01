import { db } from '@/lib/db'
import { generateStatementPDF } from '@/lib/statement-pdf'
import { fetchAppTz } from '@/lib/tz-helpers'
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
            orderBy: { id: 'desc' },
          },
        },
      }),
    ])

    if (!client) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
    }

    const appTz = await fetchAppTz()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfBuffer = generateStatementPDF(client as any, settings as any, appTz.timezone, appTz.locale)

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
