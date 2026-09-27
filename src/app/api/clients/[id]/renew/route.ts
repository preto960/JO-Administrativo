import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { getPermissions } from '@/lib/permissions'
import { logAction } from '@/lib/audit-log'
import { getPaymentMethodsFromDB, FALLBACK_METHODS } from '@/lib/payment-methods'
import { fetchToday, fetchAppTz } from '@/lib/tz-helpers'

function getPlanDays(durationType: string, durationDays: number | null): number {
  switch (durationType) {
    case 'dia': return 1
    case '1_mes': return 30
    case 'bimestral': return 60
    case 'anual': return 365
    case 'otro': return durationDays || 0
    default: return 30
  }
}

// POST /api/clients/[id]/renew — assign/renew a plan for a client
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
      return NextResponse.json({ error: 'Debes seleccionar un plan' }, { status: 400 })
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
        { error: 'No hay caja abierta. Debe abrir la caja antes de renovar una suscripción.' },
        { status: 400 }
      )
    }

    // Validate payment method(s) — fetch PM list now (effectivePrice will be used later)
    const pmList = await getPaymentMethodsFromDB().catch(() => FALLBACK_METHODS)

    // ── Calculate effective price (promo + discount auto-applied) ──
    // Use date-only comparison to avoid timezone issues (server is UTC, user is local)
    const now = new Date()
    let effectivePrice = plan.cost
    let hasPromo = false
    let hasDiscount = false

    // Get app timezone for date comparison
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
      // No payment specified (e.g. free plan or trial) — skip sale creation
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

    // Resolve currency
    const settings = await db.settings.findFirst()
    let resolvedCurrencyId = currencyId || settings?.baseCurrencyId || ''
    if (!resolvedCurrencyId) {
      const refCurrency = await db.currency.findFirst({ where: { code: settings?.referenceCurrency || 'USD' } })
      resolvedCurrencyId = refCurrency?.id || ''
    }

    // ── Determine membership values based on planType ──
    const planType = plan.planType || 'dias' // backward compat
    const totalDays = getPlanDays(plan.durationType, plan.durationDays)
    const ticketCount = planType === 'tickets' ? plan.ticketCount : 0

    // For "horario" type, we still set a reasonable duration (30 days default)
    // so the membership has an expiration window
    const effectiveDays = planType === 'horario' ? 30 : (planType === 'tickets' ? 90 : totalDays)

    // ── Membership: create or update ──
    // IMPORTANT: Always look for a gym membership (not tickets) when renewing a gym plan
    // and look for a tickets membership when renewing a tickets plan
    // This prevents overwriting a tiquetera when renewing gym and vice versa
    const existingMembership = await db.clientMembership.findFirst({
      where: {
        clientId: id,
        planType: planType === 'tickets' ? 'tickets' : { in: ['dias', 'horario'] },
      },
      orderBy: { createdAt: 'desc' },
    })

    let membership

    // Common membership data
    const membershipData = {
      status: 'Activo' as const,
      planId: plan.id,
      planType,
      tarifa: plan.name,
      paymentDate: new Date(),
      // Reset tickets to 0 if changing FROM tickets TO another type
      ticketsRemaining: planType === 'tickets' ? ticketCount : 0,
      startTime: planType === 'horario' ? plan.startTime : null,
      endTime: planType === 'horario' ? plan.endTime : null,
    }

    if (existingMembership && existingMembership.endDate && existingMembership.status === 'Activo') {
      // Active membership: accumulate days
      const existingEnd = new Date(existingMembership.endDate)
      const newEndDate = new Date(existingEnd)
      newEndDate.setDate(newEndDate.getDate() + effectiveDays)

      membership = await db.clientMembership.update({
        where: { id: existingMembership.id },
        data: {
          ...membershipData,
          endDate: newEndDate,
          daysRemaining: planType === 'tickets' ? effectiveDays : (existingMembership.daysRemaining + effectiveDays),
          // If switching plan type, ensure tickets reset
          ticketsRemaining: planType === 'tickets' ? ticketCount : 0,
        },
      })
    } else if (existingMembership) {
      // Existing but not active: update it
      const endDate = new Date(today)
      endDate.setDate(endDate.getDate() + effectiveDays)

      membership = await db.clientMembership.update({
        where: { id: existingMembership.id },
        data: {
          ...membershipData,
          startDate: today,
          endDate,
          daysRemaining: effectiveDays,
        },
      })
    } else {
      // No existing membership: create new
      const endDate = new Date(today)
      endDate.setDate(endDate.getDate() + effectiveDays)

      membership = await db.clientMembership.create({
        data: {
          clientId: id,
          ...membershipData,
          startDate: today,
          endDate,
          daysRemaining: effectiveDays,
        },
      })
    }

    // ── Create Sale record for the subscription payment ──
    let saleId: string | null = null
    let movementId: string | null = null
    let movementError: string | null = null
    let receivableId: string | null = null

    if (allPayments.length > 0 && resolvedCurrencyId) {
      const clientName = `${client.name}${client.lastName ? ' ' + client.lastName : ''}`

      try {
        // Build the SalePayment records — use actual payment amounts (respects abono)
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

        const previousPlan = existingMembership?.tarifa && existingMembership.tarifa !== plan.name
          ? `${existingMembership.tarifa} -> ${plan.name}`
          : plan.name
        const concept = `Suscripción plan "${previousPlan}" - ${clientName}${refDisplay}`

        // Create Sale + SalePayment(s)
        const sale = await db.sale.create({
          data: {
            clientId: id,
            cashRegId: cashRegId || null,
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

        // Update cash register: add CASH payments to physical balance (all non-credit payments)
        const creditCodeSet = new Set(pmList.filter((m: any) => m.isCredit).map((m: any) => m.code))
        const nonCreditCashAmount = allPayments
          .filter(p => {
            const pm = pmList.find((m: any) => m.code === p.method)
            return pm?.isCash && !creditCodeSet.has(p.method)
          })
          .reduce((s, p) => s + p.amount, 0)

        if (cashRegId && nonCreditCashAmount > 0) {
          const register = await db.cashRegister.findUnique({ where: { id: cashRegId } })
          if (register && register.status === 'abierta') {
            await db.cashRegister.update({
              where: { id: cashRegId },
              data: { currentAmt: Math.round((register.currentAmt + nonCreditCashAmount) * 100) / 100 },
            })
          } else if (register && register.status !== 'abierta') {
            movementError = `Caja está cerrada (status: ${register.status})`
          }
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
        action: 'renew_plan',
        planName: plan.name,
        planId: plan.id,
        planType,
        totalDays: effectiveDays,
        ticketCount: planType === 'tickets' ? ticketCount : 0,
        cost: effectivePrice,
        originalCost: plan.cost,
        discountAmount: discountAmount > 0 ? discountAmount : undefined,
        discountNotes: discountNotes || undefined,
        paymentMethod: isHybrid ? `Híbrido (${allPayments.map(p => p.method).join(', ')})` : (allPayments[0]?.method || null),
        saleId,
        movementId,
        receivableId,
      },
      request,
    })

    const detailMessage = planType === 'tickets'
      ? `Plan "${plan.name}" asignado (${ticketCount} tickets)`
      : planType === 'horario'
        ? `Plan "${plan.name}" asignado (${plan.startTime} - ${plan.endTime}, ${effectiveDays} días)`
        : `Plan "${plan.name}" asignado (+${effectiveDays} días)`

    return NextResponse.json({
      membership,
      saleId,
      movementId,
      movementError,
      receivableId,
      message: detailMessage,
    }, { status: 201 })
  } catch (error) {
    console.error('[Renew POST]', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Error al renovar suscripción' }, { status: 500 })
  }
}