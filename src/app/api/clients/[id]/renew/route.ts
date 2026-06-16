import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { getPermissions } from '@/lib/permissions'
import { logAction } from '@/lib/audit-log'

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
  if (!perms.canManageClients) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const { id } = await params

  try {
    const body = await request.json()
    const { planId, paymentMethod, paymentReference, cashRegId, branchId } = body as {
      planId: string
      paymentMethod?: string
      paymentReference?: string
      cashRegId?: string
      branchId?: string
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

    // If payment method provided, validate it
    let pmInfo: { code: string; isCash: boolean } | null = null
    if (paymentMethod) {
      const { getPaymentMethodsFromDB, FALLBACK_METHODS } = await import('@/lib/payment-methods')
      const pmList = await getPaymentMethodsFromDB().catch(() => FALLBACK_METHODS)
      pmInfo = pmList.find((m: { code: string }) => m.code === paymentMethod) || null
      if (!pmInfo) {
        return NextResponse.json({ error: 'Método de pago no válido' }, { status: 400 })
      }
    }

    // ── Membership: accumulate days if active ──
    const totalDays = getPlanDays(plan.durationType, plan.durationDays)
    const cost = plan.cost
    const today = getTodayBogota()

    const existingMembership = await db.clientMembership.findFirst({
      where: { clientId: id },
      orderBy: { createdAt: 'desc' },
    })

    let membership
    if (existingMembership && existingMembership.endDate && existingMembership.status === 'Activo') {
      // Active membership with future endDate → extend from existing endDate
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
          daysRemaining: totalDays, // store new plan days added
          ticketsRemaining: totalDays,
        },
      })
    } else {
      // Expired or no membership → start from today
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

    // ── Create CashMovement (for ALL payment methods, not just cash) ──
    let movementId: string | null = null
    if (paymentMethod && cashRegId) {
      const register = await db.cashRegister.findUnique({ where: { id: cashRegId } })

      if (register && register.status === 'abierta') {
        // Resolve currency — create default if none exists
        let effectiveCurrency = await db.currency.findFirst()
        if (!effectiveCurrency) {
          effectiveCurrency = await db.currency.create({
            data: { code: 'COP', name: 'Peso Colombiano', symbol: '$', isBase: true },
          })
        }

        const clientName = `${client.name}${client.lastName ? ' ' + client.lastName : ''}`
        const refPart = paymentReference?.trim() ? ` (${paymentMethod}: ${paymentReference.trim()})` : ` (${paymentMethod})`
        const concept = `Renovación plan: ${plan.name} - ${clientName}${refPart}`

        const movement = await db.cashMovement.create({
          data: {
            cashRegId,
            userId: auth.id,
            type: 'entrada',
            amount: cost,
            concept,
            currencyId: effectiveCurrency.id,
          },
        })

        // Update cash register current amount
        await db.cashRegister.update({
          where: { id: cashRegId },
          data: { currentAmt: Math.round((register.currentAmt + cost) * 100) / 100 },
        })

        movementId = movement.id
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
        movementId,
      },
      request,
    })

    return NextResponse.json({
      membership,
      movementId,
      message: `Plan "${plan.name}" asignado (+${totalDays} días)`,
    }, { status: 201 })
  } catch (error) {
    console.error('[Renew POST]', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Error al renovar suscripción' }, { status: 500 })
  }
}