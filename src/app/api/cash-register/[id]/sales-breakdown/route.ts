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

    // Get cash movements for this register
    const movements = await db.cashMovement.findMany({
      where: { cashRegId: id },
      orderBy: { createdAt: 'desc' },
    })

    // Categorize sales: if sale has lines with products → POS, if no lines → Subscription
    const posSales = sales.filter(s => s.lines.length > 0)
    const subscriptionSales = sales.filter(s => s.lines.length === 0)

    // Parse plan name from concept string. Handles multiple formats:
    // 'Suscripción plan "Diario" - Juan Pérez'
    // 'Suscripción plan "Diario -> Mensual" - Juan'
    // 'Renovación plan: Diario - Juan Pérez'
    function parsePlanFromConcept(concept: string): string {
      // Try quoted format first: plan "Diario" or plan "Diario -> Mensual"
      const quoted = concept.match(/plan\s+"([^"]+)"/)
      if (quoted) return quoted[1]
      // Fallback: colon format: plan: Diario or plan: Diario -> Mensual
      const colon = concept.match(/plan:\s*(.+?)(?:\s*[-–—]|\s*\()/)
      if (colon) return colon[1].trim()
      return ''
    }

    // Build a set of CashMovement IDs that are matched to a subscription Sale
    // This prevents showing duplicates (Sale + CashMovement for the same renewal)
    const matchedMovementIds = new Set<string>()

    const subscriptionSalesWithPlan = subscriptionSales.map(s => {
      // Build client name with proper spacing (must match concept format)
      const saleClientName = s.client
        ? `${s.client.name}${s.client.lastName ? ' ' + s.client.lastName : ''}`
        : ''
      let planName = ''

      // Try to find the matching CashMovement by amount + client name in concept
      // Use findIndex instead of find so we can match multiple movements to same client
      const mIdx = movements.findIndex(m => {
        if (m.type !== 'entrada') return false
        if (!m.concept.includes('Suscripción') && !m.concept.includes('Renovación')) return false
        if (Math.abs(s.total - m.amount) >= 0.01) return false
        if (!saleClientName) return false
        if (!m.concept.includes(saleClientName)) return false
        return true
      })

      if (mIdx !== -1) {
        const matchingMovement = movements[mIdx]
        planName = parsePlanFromConcept(matchingMovement.concept)
        matchedMovementIds.add(matchingMovement.id)
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

    // Legacy subscription movements (old renewals that didn't create a Sale)
    // Filter out movements already matched to a subscription Sale
    const legacySubscriptions = movements.filter(m => {
      if (m.type !== 'entrada') return false
      if (!m.concept.includes('Suscripción') && !m.concept.includes('Renovación')) return false
      return !matchedMovementIds.has(m.id)
    })

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
      subscriptionSales: subscriptionSalesWithPlan,
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