import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { getPermissions } from '@/lib/permissions'
import { logAction } from '@/lib/audit-log'
import { getPaymentMethodsFromDB, FALLBACK_METHODS } from '@/lib/payment-methods'
import { fetchToday, fetchAppTz } from '@/lib/tz-helpers'

// POST /api/clients/[id]/tiquetera — add a tiquetera (ticket plan) to a client
// Creates a NEW ClientMembership with planType "tickets" WITHOUT affecting the existing gym membership
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if ('status' in auth) return auth
  const perms = getPermissions(auth.role)
  if (!perms.canManageClients && !perms.canMarkAttendance) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const { id } = await params

  try {
    const body = await request.json()
    const { planId, paymentMethod, paymentReference, cashRegId, branchId, currencyId, payments: hybridPayments } = body as {
      planId: string
      paymentMethod?: string
      paymentReference?: string
      cashRegId?: string
      branchId?: string
      currencyId?: string
      payments?: Array<{ method: string; amount: number; reference?: string }>
    }

    if (!planId) {
      return NextResponse.json({ error: 'Debes seleccionar un plan de tickets' }, { status: 400 })
    }

    const client = await db.client.findUnique({ where: { id } })
    if (!client) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
    }

    const plan = await db.plan.findUnique({ where: { id: planId } })
    if (!plan) {
      return NextResponse.json({ error: 'Plan no encontrado' }, { status: 404 })
    }
    if (!plan.active) {
      return NextResponse.json({ error: 'Este plan está inactivo' }, { status: 400 })
    }
    if (plan.planType !== 'tickets') {
      return NextResponse.json({ error: 'Este endpoint solo acepta planes de tipo tickets (tiquetera)' }, { status: 400 })
    }

    // ── Hard-block: cash register must be open ──
    const effectiveBranchId = branchId || null
    const openRegister = await db.cashRegister.findFirst({
      where: {
        branchId: effectiveBranchId ?? undefined,
        status: 'abierta',
      },
      orderBy: { openingDate: 'desc' },
    })
    if (!openRegister) {
      return NextResponse.json(
        { error: 'No hay caja abierta. Debe abrir la caja antes de agregar una tiquetera.' },
        { status: 400 }
      )
    }

    // Validate payment method(s) — fetch PM list now (effectivePrice will be used later)
    const pmList = await getPaymentMethodsFromDB().catch(() => FALLBACK_METHODS)

    // ── Calculate effective price (promo + discount) ──
    const now = new Date()
    let effectivePrice = plan.cost
    let hasPromo = false
    let hasDiscount = false

    const appTz = await fetchAppTz().catch(() => ({ timezone: 'America/Bogota' }))
    const toDS = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: appTz.timezone })
    const nowStr = toDS(now)

    if (plan.promoPrice != null && plan.promoPrice > 0 && plan.promoStartDate && plan.promoEndDate) {
      if (nowStr >= toDS(plan.promoStartDate) && nowStr <= toDS(plan.promoEndDate)) {
        effectivePrice = plan.promoPrice
        hasPromo = true
      }
    }
    if (plan.discountPercentage > 0 && plan.discountStartDate && plan.discountEndDate) {
      if (nowStr >= toDS(plan.discountStartDate) && nowStr <= toDS(plan.discountEndDate)) {
        effectivePrice = Math.round((effectivePrice - (effectivePrice * plan.discountPercentage / 100)) * 100) / 100
        hasDiscount = true
      }
    }

    const discountAmount = Math.round((plan.cost - effectivePrice) * 100) / 100
    const discountNotes = hasPromo && hasDiscount
      ? `Promo $${plan.promoPrice} + Descuento ${plan.discountPercentage}%`
      : hasPromo
        ? `Precio promocional $${plan.promoPrice}`
        : hasDiscount
          ? `Descuento ${plan.discountPercentage}%`
          : null

    // Build payments array — frontend always sends payments[] now (even single mode = 1 entry)
    // For legacy clients still sending paymentMethod/paymentReference, normalize to a 1-entry array
    // using effectivePrice as the default amount.
    const allPayments: Array<{ method: string; amount: number; reference?: string }> = Array.isArray(hybridPayments) && hybridPayments.length > 0
      ? hybridPayments.map(p => ({ method: p.method, amount: Number(p.amount) || 0, reference: p.reference?.trim() || undefined }))
      : (paymentMethod ? [{ method: paymentMethod, amount: effectivePrice, reference: paymentReference?.trim() || undefined }] : [])
    const isHybrid = allPayments.length > 1
    let pmInfo: { code: string; isCash: boolean; isCredit: boolean; isLocalCurrency: boolean } | null = null


    if (allPayments.length === 0) {
      // No payment specified (e.g. free plan) — skip sale creation
    } else {
      // Validate each payment method exists
      for (const p of allPayments) {
        const found = pmList.find((m: any) => m.code === p.method)
        if (!found) return NextResponse.json({ error: `Método de pago no válido: ${p.method}` }, { status: 400 })
      }
      // Validate sum of payments equals effectivePrice
      const sum = Math.round(allPayments.reduce((s, p) => s + p.amount, 0) * 100) / 100
      if (Math.abs(sum - effectivePrice) > 0.01) {
        return NextResponse.json({
          error: `El total de los pagos (${sum.toFixed(2)}) no coincide con el precio del plan (${effectivePrice.toFixed(2)}). Use modo Híbrido para combinar abono + crédito.`,
        }, { status: 400 })
      }
      // Determine pmInfo from single payment (for backward-compat with non-hybrid paths)
      if (!isHybrid) {
        pmInfo = pmList.find((m: any) => m.code === allPayments[0].method) || null
        if (!pmInfo) return NextResponse.json({ error: 'Método de pago no válido' }, { status: 400 })
      } else {
        pmInfo = { code: 'hibrido', isCash: false, isCredit: false, isLocalCurrency: false }
      }
    }

    const today = await fetchToday()
    const ticketCount = plan.ticketCount

    // Calculate tiquetera validity from plan's ticketDurationMonths (default 2 months = 60 days)
    const ticketDurationMonths = plan.ticketDurationMonths || 2
    const totalDays = ticketDurationMonths * 30

    // ── Create NEW membership for tiquetera (does NOT affect existing gym membership) ──
    const ticketEndDate = new Date(today)
    ticketEndDate.setDate(ticketEndDate.getDate() + totalDays)

    const membership = await db.clientMembership.create({
      data: {
        clientId: id,
        status: 'Activo',
        planId: plan.id,
        planType: 'tickets',
        tarifa: plan.name,
        paymentDate: today,   // Use app-local date (e.g. Venezuela), not UTC new Date()
        ticketsRemaining: ticketCount,
        startDate: today,
        endDate: ticketEndDate,
        daysRemaining: totalDays,
      },
    })

    // ── Create Sale record ──
    let saleId: string | null = null
    let movementError: string | null = null
    let receivableId: string | null = null

    // Resolve currency
    const settings = await db.settings.findFirst()
    let resolvedCurrencyId = currencyId || settings?.baseCurrencyId || ''
    if (!resolvedCurrencyId) {
      const refCurrency = await db.currency.findFirst({ where: { code: settings?.referenceCurrency || 'USD' } })
      resolvedCurrencyId = refCurrency?.id || ''
    }

    if (allPayments.length > 0 && resolvedCurrencyId) {
      const clientName = `${client.name}${client.lastName ? ' ' + client.lastName : ''}`

      try {
        // Build SalePayment records — use actual payment amounts (respects abono)
        const salePayments = allPayments.map(p => ({
          method: p.method,
          amount: Math.round(p.amount * 100) / 100,
          currencyId: resolvedCurrencyId,
          reference: p.reference?.trim() || null,
        }))

        const hybridLabel = isHybrid
          ? `Híbrido (${allPayments.map(p => p.method).join(', ')})`
          : allPayments[0]?.method || ''

        const refPart = allPayments.map(p => p.reference?.trim()).filter(Boolean).join(', ')
        const refDisplay = refPart ? `: ${refPart}` : ''

        const concept = `Tiquetera "${plan.name}" - ${clientName}${refDisplay}`

        const sale = await db.sale.create({
          data: {
            clientId: id,
            cashRegId: cashRegId || openRegister.id,
            userId: auth.userId,
            branchId: effectiveBranchId || '',
            total: effectivePrice,
            originalTotal: plan.cost,
            discountAmount: discountAmount > 0 ? discountAmount : 0,
            discountNotes: discountNotes,
            status: 'completada',
            currencyId: resolvedCurrencyId,
            syncStatus: 'synced',
            payments: {
              create: salePayments,
            },
          },
        })
        saleId = sale.id

        // Update cash register: add CASH payments to physical balance (all non-credit cash payments)
        const creditCodeSet = new Set(pmList.filter((m: any) => m.isCredit).map((m: any) => m.code))
        const nonCreditCashAmount = allPayments
          .filter(p => {
            const pm = pmList.find((m: any) => m.code === p.method)
            return pm?.isCash && !creditCodeSet.has(p.method)
          })
          .reduce((s, p) => s + p.amount, 0)

        if (openRegister && nonCreditCashAmount > 0) {
          await db.cashRegister.update({
            where: { id: openRegister.id },
            data: { currentAmt: Math.round((openRegister.currentAmt + nonCreditCashAmount) * 100) / 100 },
          })
        }

        // Handle credit: create AccountReceivable for the credit portion (sum of credit payments)
        const creditPortion = allPayments
          .filter(p => {
            const pm = pmList.find((m: any) => m.code === p.method)
            return pm?.isCredit
          })
          .reduce((s, p) => s + p.amount, 0)

        if (creditPortion > 0) {
          const receivable = await db.accountReceivable.create({
            data: {
              clientId: id,
              saleId: sale.id,
              amount: Math.round(creditPortion * 100) / 100,
              pendingBalance: Math.round(creditPortion * 100) / 100,
              status: 'pendiente',
              currencyId: resolvedCurrencyId,
              createdById: auth.userId,
              dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
          })
          receivableId = receivable.id
        }
      } catch (err) {
        movementError = err instanceof Error ? err.message : String(err)
      }
    }

    await logAction({
      action: 'update',
      entity: 'client',
      entityId: id,
      details: {
        action: 'add_tiquetera',
        planName: plan.name,
        planId: plan.id,
        ticketCount,
        ticketDurationMonths,
        totalDays,
        cost: effectivePrice,
        originalCost: plan.cost,
        discountAmount: discountAmount > 0 ? discountAmount : undefined,
        discountNotes: discountNotes || undefined,
        paymentMethod: isHybrid ? `Híbrido (${allPayments.map(p => p.method).join(', ')})` : (allPayments[0]?.method || null),
        saleId,
        receivableId,
      },
      request,
    })

    return NextResponse.json({
      membership,
      saleId,
      movementError,
      receivableId,
      message: `Tiquetera "${plan.name}" asignada (${ticketCount} tickets, ${ticketDurationMonths} mes${ticketDurationMonths !== 1 ? 'es' : ''})`,
    }, { status: 201 })
  } catch (error) {
    console.error('[Tiquetera POST]', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Error al agregar tiquetera' }, { status: 500 })
  }
}
