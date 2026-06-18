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

    // Build a set of subscription sale IDs and their (amount, date, clientId) to filter duplicate CashMovements
    const subSaleKeys = new Set(
      subscriptionSales.map(s => `${s.total}-${s.date.getTime()}-${s.clientId || ''}`)
    )

    // Legacy subscription movements (old renewals that didn't create a Sale)
    // Filter out movements that correspond to an existing subscription Sale (same amount + date + clientId pattern)
    const legacySubscriptions = movements.filter(m => {
      if (m.type !== 'entrada') return false
      if (!m.concept.includes('Suscripción') && !m.concept.includes('Renovación')) return false
      // Check if this movement matches a subscription sale (to avoid duplicates)
      // Movement and Sale created at roughly same time with same amount
      return !subscriptionSales.some(s => {
        const timeDiff = Math.abs(s.date.getTime() - m.createdAt.getTime())
        return Math.abs(s.total - m.amount) < 0.01 && timeDiff < 5000
      })
    })

    // Get membership info for subscription sales to show plan names
    const clientIds = [...new Set(subscriptionSales.map(s => s.clientId).filter(Boolean))] as string[]
    const memberships = clientIds.length > 0
      ? await db.clientMembership.findMany({
          where: { clientId: { in: clientIds } },
          orderBy: { createdAt: 'desc' },
        })
      : []

    // Build a map: clientId -> most recent membership
    const membershipMap = new Map<string, { tarifa: string; planId: string; createdAt: Date }>()
    for (const m of memberships) {
      if (!membershipMap.has(m.clientId)) {
        membershipMap.set(m.clientId, { tarifa: m.tarifa || '', planId: m.planId, createdAt: m.createdAt })
      }
    }

    // Helper: parse plan name from legacy concept string like:
    // 'Suscripción plan "Diario" - Juan Pérez' or 'Suscripción plan "Mensual -> Diario" - Juan'
    function parsePlanFromConcept(concept: string): string {
      const match = concept.match(/plan\s+"([^"]+)"/)
      return match ? match[1] : ''
    }

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
      subscriptionSales: subscriptionSales.map(s => {
        const membership = s.clientId ? membershipMap.get(s.clientId) : null
        const planName = membership?.tarifa || ''
        const ref = s.payments[0]?.reference
        return {
          id: s.id,
          date: s.date,
          total: s.total,
          method: s.payments[0]?.method || '',
          clientName: s.client ? `${s.client.name}${s.client.lastName ? ' ' + s.client.lastName : ''}` : null,
          planName,
          description: ref ? `Ref: ${ref}` : '',
        }
      }),
      legacySubscriptions: legacySubscriptions.map(m => ({
        id: m.id,
        date: m.createdAt,
        total: m.amount,
        method: '',
        clientName: '',
        planName: parsePlanFromConcept(m.concept),
        description: m.concept,
      })),
      posTotal,
      subTotal,
      legacyTotal,
      totalCount: posSales.length + subscriptionSales.length,
    })
  } catch (error) {
    console.error('[GET cash-register sales-breakdown]', error)
    return NextResponse.json({ error: 'Error al obtener desglose' }, { status: 500 })
  }
}