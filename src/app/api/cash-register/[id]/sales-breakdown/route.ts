import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/cash-register/[id]/sales-breakdown
// Returns sales for a specific cash register, categorized as POS or Subscription
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

    // Get cash movements for this register (only to extract plan name for subscriptions)
    const movements = await db.cashMovement.findMany({
      where: { cashRegId: id },
      orderBy: { createdAt: 'desc' },
    })

    // Categorize sales: if sale has lines with products → POS, if no lines → Subscription
    const posSales = sales.filter(s => s.lines.length > 0)
    const subscriptionSales = sales.filter(s => s.lines.length === 0)

    // Parse plan name from concept string. Handles multiple formats:
    // '[saleId] Suscripción plan "Diario" - Juan Pérez'
    // 'Suscripción plan "Diario" - Juan Pérez'
    // 'Suscripción plan "Diario -> Mensual" - Juan'
    // 'Renovación plan: Diario - Juan Pérez'
    function parsePlanFromConcept(concept: string): string {
      // Strip leading [saleId] prefix if present
      const stripped = concept.replace(/^\[[\w-]+\]\s*/, '')
      // Try quoted format first: plan "Diario" or plan "Diario -> Mensual"
      const quoted = stripped.match(/plan\s+"([^"]+)"/)
      if (quoted) return quoted[1]
      // Fallback: colon format: plan: Diario or plan: Diario -> Mensual
      const colon = stripped.match(/plan:\s*(.+?)(?:\s*[-–—]|\s*\()/)
      if (colon) return colon[1].trim()
      return ''
    }

    // Build lookup: saleId → CashMovement (for plan name extraction)
    // New movements have [saleId] prefix in concept
    const movementBySaleId = new Map<string, typeof movements[0]>()
    for (const m of movements) {
      const match = m.concept.match(/^\[([\w-]+)\]\s*/)
      if (match) {
        movementBySaleId.set(match[1], m)
      }
    }

    // For old movements without [saleId], build a fallback lookup by amount + client name
    // Only used for subscription sales that don't have a new-style movement
    const oldSubMovements = movements.filter(m =>
      m.type === 'entrada' &&
      (m.concept.includes('Suscripción') || m.concept.includes('Renovación')) &&
      !m.concept.match(/^\[[\w-]+\]\s*/)
    )

    const subscriptionSalesWithPlan = subscriptionSales.map(s => {
      const saleClientName = s.client
        ? `${s.client.name}${s.client.lastName ? ' ' + s.client.lastName : ''}`
        : ''

      let planName = ''

      // 1. Try new-style match by saleId (100% reliable)
      const matchedMovement = movementBySaleId.get(s.id)
      if (matchedMovement) {
        planName = parsePlanFromConcept(matchedMovement.concept)
      } else {
        // 2. Fallback for old movements: match by amount + client name
        const oldMatch = oldSubMovements.find(m => {
          if (Math.abs(s.total - m.amount) >= 0.01) return false
          if (!saleClientName) return false
          if (!m.concept.includes(saleClientName)) return false
          return true
        })
        if (oldMatch) {
          planName = parsePlanFromConcept(oldMatch.concept)
        }
      }

      const ref = s.payments[0]?.reference
      return {
        id: s.id,
        date: s.date,
        total: s.total,
        method: s.payments[0]?.method || '',
        clientName: saleClientName || null,
        planName,
        description: ref ? `Ref: ${ref}` : '',
      }
    })

    const posTotal = posSales.reduce((sum, s) => sum + s.total, 0)
    const subTotal = subscriptionSales.reduce((sum, s) => sum + s.total, 0)

    return NextResponse.json({
      posSales: posSales.map(s => ({
        id: s.id,
        date: s.date,
        total: s.total,
        method: s.payments[0]?.method || '',
        clientName: s.client ? `${s.client.name}${s.client.lastName ? ' ' + s.client.lastName : ''}` : null,
        description: s.lines.map(l => l.product?.name || 'Producto').join(', '),
      })),
      subscriptionSales: subscriptionSalesWithPlan,
      posTotal,
      subTotal,
      totalCount: posSales.length + subscriptionSales.length,
    })
  } catch (error) {
    console.error('[GET cash-register sales-breakdown]', error)
    return NextResponse.json({ error: 'Error al obtener desglose' }, { status: 500 })
  }
}