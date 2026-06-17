import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/cash-register/[id]/sales-breakdown
// Returns sales and movements for a specific cash register, categorized as POS or Subscription
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Get sales for this cash register
    const sales = await db.sale.findMany({
      where: { cashRegId: id },
      include: {
        payments: true,
        lines: { include: { product: { select: { name: true } } } },
        client: { select: { id: true, name: true, lastName: true } },
      },
      orderBy: { date: 'desc' },
    })

    // Get cash movements for this register (for backward compat with old renewals)
    const movements = await db.cashMovement.findMany({
      where: { cashRegId: id },
      orderBy: { createdAt: 'desc' },
    })

    // Categorize sales: if sale has lines with products → POS, if no lines → Subscription
    const posSales = sales.filter(s => s.lines.length > 0)
    const subscriptionSales = sales.filter(s => s.lines.length === 0)

    // Legacy subscription movements (old renewals that didn't create a Sale)
    const saleIds = new Set(sales.map(s => s.id))
    const legacySubscriptions = movements.filter(m =>
      (m.concept.includes('Suscripción') || m.concept.includes('Renovación')) &&
      m.type === 'entrada'
    )

    const posTotal = posSales.reduce((sum, s) => sum + s.total, 0)
    const subTotal = subscriptionSales.reduce((sum, s) => sum + s.total, 0)
    const legacyTotal = legacySubscriptions.reduce((sum, m) => sum + m.amount, 0)

    return NextResponse.json({
      posSales: posSales.map(s => ({
        id: s.id,
        date: s.date,
        total: s.total,
        method: s.payments[0]?.method || '',
        clientName: s.client ? `${s.client.name}${s.client.lastName ? ' ' + s.client.lastName : ''}` : null,
        description: s.lines.map(l => l.product?.name || 'Producto').join(', '),
      })),
      subscriptionSales: subscriptionSales.map(s => ({
        id: s.id,
        date: s.date,
        total: s.total,
        method: s.payments[0]?.method || '',
        clientName: s.client ? `${s.client.name}${s.client.lastName ? ' ' + s.client.lastName : ''}` : null,
        description: s.payments[0]?.reference ? `Ref: ${s.payments[0].reference}` : '',
      })),
      legacySubscriptions: legacySubscriptions.map(m => ({
        id: m.id,
        date: m.createdAt,
        total: m.amount,
        method: '',
        clientName: '',
        description: m.concept,
      })),
      posTotal,
      subTotal,
      legacyTotal,
      totalCount: sales.length,
    })
  } catch (error) {
    console.error('[GET cash-register sales-breakdown]', error)
    return NextResponse.json({ error: 'Error al obtener desglose' }, { status: 500 })
  }
}