import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { getPermissions } from '@/lib/permissions'
import { logAction } from '@/lib/audit-log'
import { getPaymentMethodsFromDB, FALLBACK_METHODS } from '@/lib/payment-methods'

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

/** Get today at midnight in Colombia timezone */
function getTodayBogota(): Date {
  const now = new Date()
  const bogota = new Date(now.toLocaleString('en-US', { timeZone: 'America/Bogota' }))
  bogota.setHours(0, 0, 0, 0)
  return bogota
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
    const { planId, paymentMethod, paymentReference, cashRegId, branchId, currencyId } = body as {
      planId: string
      paymentMethod?: string
      paymentReference?: string
      cashRegId?: string
      branchId?: string
      currencyId?: string
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

    // Validate payment method if provided
    let pmInfo: { code: string; isCash: boolean; isCredit: boolean; isLocalCurrency: boolean } | null = null
    if (paymentMethod) {
      const pmList = await getPaymentMethodsFromDB().catch(() => FALLBACK_METHODS)
      pmInfo = pmList.find((m: any) => m.code === paymentMethod) || null
      if (!pmInfo) {
        return NextResponse.json({ error: 'Método de pago no válido' }, { status: 400 })
      }
    }

    const totalDays = getPlanDays(plan.durationType, plan.durationDays)
    const cost = plan.cost
    const today = getTodayBogota()
    const effectiveBranchId = branchId || null

    // Resolve currency
    const settings = await db.settings.findFirst()
    let resolvedCurrencyId = currencyId || settings?.baseCurrencyId || ''
    if (!resolvedCurrencyId) {
      const refCurrency = await db.currency.findFirst({ where: { code: settings?.referenceCurrency || 'USD' } })
      resolvedCurrencyId = refCurrency?.id || ''
    }

    // ── Membership: accumulate days if active ──
    const existingMembership = await db.clientMembership.findFirst({
      where: { clientId: id },
      orderBy: { createdAt: 'desc' },
    })

    let membership
    if (existingMembership && existingMembership.endDate && existingMembership.status === 'Activo') {
      const existingEnd = new Date(existingMembership.endDate)
      const newEndDate = new Date(existingEnd)
      newEndDate.setDate(newEndDate.getDate() + totalDays)

      membership = await db.clientMembership.update({
        where: { id: existingMembership.id },
        data: {
          status: 'Activo',
          planId: plan.id,
          tarifa: plan.name,
          paymentDate: new Date(),
          endDate: newEndDate,
          daysRemaining: totalDays,
          ticketsRemaining: totalDays,
        },
      })
    } else {
      const endDate = new Date(today)
      endDate.setDate(endDate.getDate() + totalDays)

      if (existingMembership) {
        membership = await db.clientMembership.update({
          where: { id: existingMembership.id },
          data: {
            status: 'Activo',
            planId: plan.id,
            tarifa: plan.name,
            paymentDate: new Date(),
            startDate: today,
            endDate,
            daysRemaining: totalDays,
            ticketsRemaining: totalDays,
          },
        })
      } else {
        membership = await db.clientMembership.create({
          data: {
            clientId: id,
            status: 'Activo',
            planId: plan.id,
            tarifa: plan.name,
            paymentDate: new Date(),
            startDate: today,
            endDate,
            daysRemaining: totalDays,
            ticketsRemaining: totalDays,
          },
        })
      }
    }

    // ── Create Sale record for the subscription payment ──
    let saleId: string | null = null
    let movementId: string | null = null
    let movementError: string | null = null
    let receivableId: string | null = null

    if (paymentMethod && resolvedCurrencyId) {
      const clientName = `${client.name}${client.lastName ? ' ' + client.lastName : ''}`
      const refPart = paymentReference?.trim() ? `: ${paymentReference.trim()}` : ''
      // Include plan change info in concept if plan changed
      const previousPlan = existingMembership?.tarifa && existingMembership.tarifa !== plan.name
        ? `${existingMembership.tarifa} -> ${plan.name}`
        : plan.name
      const concept = `Suscripción plan "${previousPlan}" - ${clientName}${refPart}`

      try {
        // Create Sale + SalePayment
        const sale = await db.sale.create({
          data: {
            clientId: id,
            cashRegId: cashRegId || null,
            userId: auth.userId,
            branchId: effectiveBranchId,
            total: cost,
            status: 'completada',
            currencyId: resolvedCurrencyId,
            syncStatus: 'synced',
            payments: {
              create: {
                method: paymentMethod,
                amount: cost,
                currencyId: resolvedCurrencyId,
                reference: paymentReference?.trim() || null,
              },
            },
          },
        })
        saleId = sale.id

        // Handle cash register: only add to balance if isCash
        if (cashRegId && pmInfo?.isCash) {
          const register = await db.cashRegister.findUnique({ where: { id: cashRegId } })
          if (register && register.status === 'abierta') {
            await db.cashRegister.update({
              where: { id: cashRegId },
              data: { currentAmt: Math.round((register.currentAmt + cost) * 100) / 100 },
            })
          } else if (register && register.status !== 'abierta') {
            movementError = `Caja está cerrada (status: ${register.status})`
          }
        }

        // Create CashMovement for ALL payment methods (for visibility in cash register)
        // But only affect balance if isCash (already done above)
        if (cashRegId) {
          const register = await db.cashRegister.findUnique({ where: { id: cashRegId } })
          if (register && register.status === 'abierta') {
            try {
              // Embed saleId in concept for reliable dedup in sales-breakdown
              const conceptWithId = `[${saleId}] ${concept}`
              const movement = await db.cashMovement.create({
                data: {
                  cashRegId,
                  userId: auth.userId,
                  type: 'entrada',
                  amount: cost,
                  concept: conceptWithId,
                  currencyId: resolvedCurrencyId,
                },
              })
              movementId = movement.id
            } catch (err) {
              movementError = err instanceof Error ? err.message : String(err)
            }
          }
        }

        // Handle credit: create AccountReceivable
        if (pmInfo?.isCredit) {
          const receivable = await db.accountReceivable.create({
            data: {
              clientId: id,
              saleId: sale.id,
              amount: cost,
              pendingBalance: cost,
              status: 'pendiente',
              currencyId: resolvedCurrencyId,
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
        totalDays,
        cost,
        paymentMethod: paymentMethod || null,
        saleId,
        movementId,
        receivableId,
      },
      request,
    })

    return NextResponse.json({
      membership,
      saleId,
      movementId,
      movementError,
      receivableId,
      message: `Plan "${plan.name}" asignado (+${totalDays} días)`,
    }, { status: 201 })
  } catch (error) {
    console.error('[Renew POST]', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Error al renovar suscripción' }, { status: 500 })
  }
}