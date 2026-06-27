import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { getPaymentMethodsFromDB, FALLBACK_METHODS } from '@/lib/payment-methods'

// GET /api/cash-register/[id]/sales-breakdown
// Returns sales for a specific cash register, categorized as POS or Subscription
// Includes payment method breakdown and credit sales separated
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Get credit method codes to identify credit sales
    const pmList = await getPaymentMethodsFromDB().catch(() => FALLBACK_METHODS)
    const creditCodes = new Set(pmList.filter(m => m.isCredit).map(m => m.code))

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

    // Separate credit vs non-credit sales
    const isCreditSale = (s: typeof sales[0]) => s.payments.some(p => creditCodes.has(p.method))
    const creditSalesAll = sales.filter(isCreditSale)
    const nonCreditSales = sales.filter(s => !isCreditSale(s))

    const posSales = nonCreditSales.filter(s => s.lines.length > 0)
    const subscriptionSales = nonCreditSales.filter(s => s.lines.length === 0)

    // Parse plan name from concept string
    function parsePlanFromConcept(concept: string): string {
      const stripped = concept.replace(/^\[[\w-]+\]\s*/, '')
      const quoted = stripped.match(/plan\s+"([^"]+)"/)
      if (quoted) return quoted[1]
      const colon = stripped.match(/plan:\s*(.+?)(?:\s*[-–—]|\s*\()/)
      if (colon) return colon[1].trim()
      return ''
    }

    // Build lookup: saleId -> CashMovement
    const movementBySaleId = new Map<string, typeof movements[0]>()
    for (const m of movements) {
      const match = m.concept.match(/^\[([\w-]+)\]\s*/)
      if (match) movementBySaleId.set(match[1], m)
    }

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
      const matchedMovement = movementBySaleId.get(s.id)
      if (matchedMovement) {
        planName = parsePlanFromConcept(matchedMovement.concept)
      } else {
        const oldMatch = oldSubMovements.find(m => {
          if (Math.abs(s.total - m.amount) >= 0.01) return false
          if (!saleClientName) return false
          if (!m.concept.includes(saleClientName)) return false
          return true
        })
        if (oldMatch) planName = parsePlanFromConcept(oldMatch.concept)
      }
      const ref = s.payments[0]?.reference
      return {
        id: s.id, date: s.date, total: s.total,
        method: s.payments[0]?.method || '',
        clientName: saleClientName || null, planName,
        description: ref ? `Ref: ${ref}` : '',
      }
    })

    // Payment method breakdown (non-credit only)
    const methodTotals: Record<string, { amount: number; count: number }> = {}
    for (const s of nonCreditSales) {
      for (const p of s.payments) {
        if (creditCodes.has(p.method)) continue
        if (!methodTotals[p.method]) methodTotals[p.method] = { amount: 0, count: 0 }
        methodTotals[p.method].amount += p.amount
        methodTotals[p.method].count++
      }
    }

    // Credit sales summary
    const creditTotal = creditSalesAll.reduce((sum, s) => sum + s.total, 0)
    const creditItems = creditSalesAll.map(s => ({
      id: s.id, date: s.date, total: s.total,
      clientName: s.client ? `${s.client.name}${s.client.lastName ? ' ' + s.client.lastName : ''}` : null,
      description: s.lines.map(l => l.product?.name || 'Producto').join(', ')
    }))

    const posTotal = posSales.reduce((sum, s) => sum + s.total, 0)
    const subTotal = subscriptionSales.reduce((sum, s) => sum + s.total, 0)
    const realInRegister = posTotal + subTotal

    return NextResponse.json({
      posSales: posSales.map(s => ({
        id: s.id, date: s.date, total: s.total,
        method: s.payments[0]?.method || '',
        clientName: s.client ? `${s.client.name}${s.client.lastName ? ' ' + s.client.lastName : ''}` : null,
        description: s.lines.map(l => l.product?.name || 'Producto').join(', '),
      })),
      subscriptionSales: subscriptionSalesWithPlan,
      posTotal,
      subTotal,
      totalCount: nonCreditSales.length,
      creditSales: creditItems,
      creditTotal,
      methodTotals,
      realInRegister,
    })
  } catch (error) {
    console.error('[GET cash-register sales-breakdown]', error)
    return NextResponse.json({ error: 'Error al obtener desglose' }, { status: 500 })
  }
}
