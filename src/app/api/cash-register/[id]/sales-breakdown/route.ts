import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { getPaymentMethodsFromDB, FALLBACK_METHODS } from '@/lib/payment-methods'

/** Build "Híbrido (efectivo, transferencia)" label from payment method codes */
function buildHybridLabel(payments: { method: string }[], pmNameMap: Map<string, string>): string {
  const codes = [...new Set(payments.map(p => p.method))]
  if (codes.length <= 1) return pmNameMap.get(codes[0]) || codes[0] || ''
  const names = codes.map(c => pmNameMap.get(c) || c)
  return `Híbrido (${names.join(', ')})`
}

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

    // Build code -> name map for hybrid labels
    const pmNameMap = new Map<string, string>()
    for (const pm of pmList) pmNameMap.set(pm.code, pm.name)

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
      // For hybrid, show all references
      const refs = s.payments.map(p => p.reference).filter(Boolean)
      const refStr = refs.length > 0 ? refs.join(', ') : ''
      const nonCreditPayments = s.payments.filter(p => !creditCodes.has(p.method))
      return {
        id: s.id, date: s.date, total: s.total,
        method: nonCreditPayments.length > 1
          ? buildHybridLabel(nonCreditPayments, pmNameMap)
          : (nonCreditPayments[0] ? (pmNameMap.get(nonCreditPayments[0].method) || nonCreditPayments[0].method) : ''),
        clientName: saleClientName || null, planName,
        description: refStr ? `Ref: ${refStr}` : '',
      }
    })

    // Payment method breakdown (non-credit only)
    // Hybrid sales (multiple payments) are grouped as "Híbrido (metodo1, metodo2)"
    const methodTotals: Record<string, { amount: number; count: number }> = {}
    for (const s of nonCreditSales) {
      const nonCreditPayments = s.payments.filter(p => !creditCodes.has(p.method))
      if (nonCreditPayments.length === 0) continue

      if (nonCreditPayments.length > 1) {
        // Hybrid sale — group under a single "Híbrido (...)" key
        const label = buildHybridLabel(nonCreditPayments, pmNameMap)
        if (!methodTotals[label]) methodTotals[label] = { amount: 0, count: 0 }
        methodTotals[label].amount += s.total
        methodTotals[label].count++
      } else {
        // Single payment — group by method name (not code)
        const p = nonCreditPayments[0]
        const name = pmNameMap.get(p.method) || p.method
        if (!methodTotals[name]) methodTotals[name] = { amount: 0, count: 0 }
        methodTotals[name].amount += p.amount
        methodTotals[name].count++
      }
    }

    // Credit sales summary
    const creditTotal = creditSalesAll.reduce((sum, s) => sum + s.total, 0)
    const creditItems = creditSalesAll.map(s => ({
      id: s.id, date: s.date, total: s.total,
      clientName: s.client ? `${s.client.name}${s.client.lastName ? ' ' + s.client.lastName : ''}` : null,
      description: s.lines.map(l => l.product?.name || 'Producto').join(', '),
    }))

    const posTotal = posSales.reduce((sum, s) => sum + s.total, 0)
    const subTotal = subscriptionSales.reduce((sum, s) => sum + s.total, 0)

    // Manual cash movements (exclude subscription/sale-linked ones)
    // Subscription movements have [saleId] prefix or contain "Suscripción"/"Renovación"
    const manualMovements = movements.filter(m =>
      !m.concept.match(/^\[[\w-]+\]\s*/) &&
      !m.concept.includes('Suscripción') &&
      !m.concept.includes('Renovación')
    )

    const totalEntries = manualMovements.filter(m => m.type === 'entrada').reduce((s, m) => s + m.amount, 0)
    const totalExits = manualMovements.filter(m => m.type === 'salida').reduce((s, m) => s + m.amount, 0)
    const netMovements = totalEntries - totalExits

    // Real en Caja = ventas no-crédito + movimientos manuales netos
    const realInRegister = posTotal + subTotal + netMovements

    const movementEntries = manualMovements.map(m => ({
      id: m.id,
      date: m.createdAt.toISOString(),
      type: m.type as 'entrada' | 'salida',
      amount: m.amount,
      concept: m.concept,
    }))

    return NextResponse.json({
      posSales: posSales.map(s => {
        const nonCreditPayments = s.payments.filter(p => !creditCodes.has(p.method))
        return {
          id: s.id, date: s.date, total: s.total,
          method: nonCreditPayments.length > 1
            ? buildHybridLabel(nonCreditPayments, pmNameMap)
            : (nonCreditPayments[0] ? (pmNameMap.get(nonCreditPayments[0].method) || nonCreditPayments[0].method) : ''),
          clientName: s.client ? `${s.client.name}${s.client.lastName ? ' ' + s.client.lastName : ''}` : null,
          description: s.lines.map(l => l.product?.name || 'Producto').join(', '),
        }
      }),
      subscriptionSales: subscriptionSalesWithPlan,
      posTotal,
      subTotal,
      totalCount: nonCreditSales.length,
      creditSales: creditItems,
      creditTotal,
      methodTotals,
      realInRegister,
      movements: movementEntries,
      totalEntries,
      totalExits,
      netMovements,
    })
  } catch (error) {
    console.error('[GET cash-register sales-breakdown]', error)
    return NextResponse.json({ error: 'Error al obtener desglose' }, { status: 500 })
  }
}