import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clientId } = await params

    const payments = await db.clientPayment.findMany({
      where: { clientId },
      include: {
        user: { select: { name: true } },
        receivable: {
          select: {
            id: true,
            saleId: true,
            amount: true,
            pendingBalance: true,
            status: true,
            sale: {
              select: {
                date: true,
                lines: {
                  select: {
                    product: { select: { name: true } },
                    quantity: true,
                    lineTotal: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })

    return NextResponse.json({ payments })
  } catch (error) {
    console.error('[Client Payments GET] Error:', error)
    return NextResponse.json({ error: 'Error al obtener pagos' }, { status: 500 })
  }
}