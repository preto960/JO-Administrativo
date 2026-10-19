import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const sales = await db.sale.findMany({
      where: { clientId: id },
      include: {
        user: { select: { name: true } },
        payments: { include: { currency: true } },
        lines: { include: { product: { select: { name: true } } } },
        branch: { select: { name: true } },
        receivables: { select: { amount: true, pendingBalance: true, status: true, dueDate: true } },
        memberships: {
          include: { plan: { select: { name: true, planType: true } } },
          take: 1,
        },
      },
      orderBy: { date: 'desc' },
      take: 50,
    })

    return NextResponse.json({ sales })
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener ventas del cliente' }, { status: 500 })
  }
}
