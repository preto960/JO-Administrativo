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

    // Validate payment method(s)
    const isHybrid = Array.isArray(hybridPayments) && hybridPayments.length > 1
    let pmInfo: { code: string; isCash: boolean; isCredit: boolean; isLocalCurrency: boolean } | null = null
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

    if (isHybrid) {
      for (const p of hybridPayments) {
        const found = pmList.find((m: any) => m.code === p.method)
        if (!found) return NextResponse.json({ error: `Método de pago no válido: ${p.method}` }, { status: 400 })
        if (found.isCredit) return NextResponse.json({ error: 'Los pagos híbridos no permiten crédito' }, { status: 400 })
      }
      const sum = hybridPayments.reduce((s, p) => s + (p.amount || 0), 0)
      if (Math.abs(sum - effectivePrice) > 0.01) {
        return NextResponse.json({ error: `Los pagos (${sum}) no coinciden con el precio del plan (${effectivePrice})` }, { status: 400 })
      }
      pmInfo = { code: 'hibrido', isCash: false, isCredit: false, isLocalCurrency: false }
    } else if (paymentMethod) {
      pmInfo = pmList.find((m: any) => m.code === paymentMethod) || null
      if (!pmInfo) return NextResponse.json({ error: 'Método de pago no válido' }, { status: 400 })
    }

    const today = await fetchToday()
    const ticketCount = plan.ticketCount

    // ── Create NEW membership for tiquetera (does NOT affect existing gym membership) ──
    const ticketEndDate = new Date(today)
    ticketEndDate.setDate(ticketEndDate.getDate() + 90) // 90 days validity for tickets

    const membership = await db.clientMembership.create({
      data: {
        clientId: id,
        status: 'Activo',
        planId: plan.id,
        planType: 'tickets',
        tarifa: plan.name,
        paymentDate: new Date(),
        ticketsRemaining: ticketCount,
        startDate: today,
        endDate: ticketEndDate,
        daysRemaining: 90,
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

    if ((paymentMethod || isHybrid) && resolvedCurrencyId) {
      const clientName = `${client.name}${client.lastName ? ' ' + client.lastName : ''}`

      try {
        const hybridLabel = isHybrid
          ? `Híbrido (${hybridPayments.map(p => p.method).join(', ')})`
          : paymentMethod || ''

        const salePayments = isHybrid
          ? hybridPayments.map(p => ({
              method: p.method,
              amount: p.amount,
              currencyId: resolvedCurrencyId,
              reference: p.reference?.trim() || null,
            }))
          : [{
              method: paymentMethod!,
              amount: effectivePrice,
              currencyId: resolvedCurrencyId,
              reference: paymentReference?.trim() || null,
            }]

        const refPart = isHybrid
          ? hybridPayments.map(p => p.reference?.trim()).filter(Boolean).join(', ')
          : paymentReference?.trim() || ''
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

        // Handle cash register: add CASH payments to balance
        if (openRegister && pmInfo && !pmInfo.isCredit) {
          const cashAmount = isHybrid
            ? hybridPayments
                .filter(p => {
                  const pm = pmList.find((m: any) => m.code === p.method)
                  return pm?.isCash
                })
                .reduce((s, p) => s + (p.amount || 0), 0)
            : pmInfo.isCash
              ? effectivePrice
              : 0

          if (cashAmount > 0) {
            await db.cashRegister.update({
              where: { id: openRegister.id },
              data: { currentAmt: Math.round((openRegister.currentAmt + cashAmount) * 100) / 100 },
            })
          }
        }

        // Handle credit
        if (!isHybrid && pmInfo?.isCredit) {
          const receivable = await db.accountReceivable.create({
            data: {
              clientId: id,
              saleId: sale.id,
              amount: effectivePrice,
              pendingBalance: effectivePrice,
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
        cost: effectivePrice,
        originalCost: plan.cost,
        discountAmount: discountAmount > 0 ? discountAmount : undefined,
        discountNotes: discountNotes || undefined,
        paymentMethod: isHybrid ? `Híbrido (${hybridPayments.map(p => p.method).join(', ')})` : (paymentMethod || null),
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
      message: `Tiquetera "${plan.name}" asignada (${ticketCount} tickets)`,
    }, { status: 201 })
  } catch (error) {
    console.error('[Tiquetera POST]', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Error al agregar tiquetera' }, { status: 500 })
  }
}
