import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { logAction } from '@/lib/audit-log'
import { getPaymentMethodsFromDB, FALLBACK_METHODS } from '@/lib/payment-methods'

/**
 * DELETE /api/clients/[id]/membership
 * Cancel/delete a membership or tiquetera for a client.
 *
 * Body: { membershipId: string }
 *
 * Sets status to "Vencido", clears remaining days/tickets,
 * annuls the associated Sale (status → 'anulada'), and reverts cash register.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if ('status' in auth) return auth

  const { id: clientId } = await params

  try {
    const body = await request.json()
    const { membershipId } = body

    if (!membershipId) {
      return NextResponse.json({ error: 'membershipId es requerido' }, { status: 400 })
    }

    // Find the membership with its linked sale
    const membership = await db.clientMembership.findUnique({
      where: { id: membershipId },
      include: {
        plan: { select: { name: true, planType: true } },
        sale: {
          include: {
            payments: true,
            cashReg: { select: { id: true, status: true, currentAmt: true } },
            receivables: true,
          },
        },
      },
    })

    if (!membership) {
      return NextResponse.json({ error: 'Membresía no encontrada' }, { status: 404 })
    }

    if (membership.clientId !== clientId) {
      return NextResponse.json({ error: 'La membresía no pertenece a este cliente' }, { status: 403 })
    }

    const isTiquetera = membership.planType === 'tickets'
    const label = isTiquetera ? 'Tiquetera' : 'Membresía'

    // Cancel: set status to Vencido, zero out counters
    const updated = await db.clientMembership.update({
      where: { id: membershipId },
      data: {
        status: 'Vencido',
        daysRemaining: 0,
        ticketsRemaining: 0,
      },
    })

    // ── Annul the associated Sale and revert cash register ──
    let saleAnulled = false
    let cashReverted = false

    if (membership.saleId && membership.sale) {
      const sale = membership.sale

      if (sale.status !== 'anulada') {
        // Get payment methods to identify cash payments
        const pmList = await getPaymentMethodsFromDB().catch(() => FALLBACK_METHODS)

        await db.$transaction(async (tx) => {
          // 1. Revert cash register if open and there were cash payments
          if (sale.cashRegId && sale.cashReg && sale.cashReg.status === 'abierta') {
            let cashToSubtract = 0
            for (const payment of sale.payments) {
              const pm = pmList.find((m: any) => m.code === payment.method)
              if (pm?.isCash) {
                cashToSubtract += payment.amount
              }
            }
            if (cashToSubtract > 0) {
              await tx.cashRegister.update({
                where: { id: sale.cashRegId },
                data: {
                  currentAmt: Math.round((sale.cashReg.currentAmt - cashToSubtract) * 100) / 100,
                },
              })
              cashReverted = true
            }
          }

          // 2. Cancel receivables linked to this sale
          if (sale.receivables.length > 0) {
            for (const rec of sale.receivables) {
              // Cancel pending receivables
              if (rec.status === 'pendiente' || rec.status === 'parcial') {
                await tx.accountReceivable.update({
                  where: { id: rec.id },
                  data: { status: 'cancelada', pendingBalance: 0 },
                })
              }
            }
          }

          // 3. Annul the sale (don't delete — preserve audit trail)
          await tx.sale.update({
            where: { id: sale.id },
            data: { status: 'anulada' },
          })
        })

        saleAnulled = true
      }
    }

    // Audit log
    await logAction({
      action: 'cancel_membership',
      entity: 'client_membership',
      entityId: membershipId,
      details: {
        summary: `${label} cancelada: ${membership.plan?.name || membership.tarifa || 'Sin plan'}`,
        clientId,
        planType: membership.planType,
        planName: membership.plan?.name,
        saleId: membership.saleId,
        saleAnulled,
        cashReverted,
      },
      request,
    })

    return NextResponse.json({
      message: `${label} cancelada correctamente${saleAnulled ? ' — venta anulada' : ''}${cashReverted ? ' — caja revertida' : ''}`,
      membership: updated,
      saleAnulled,
      cashReverted,
    }, { status: 200 })

  } catch (error: unknown) {
    console.error('Error al cancelar membresía:', error)
    const msg = error instanceof Error ? error.message : 'Error desconocido'
    return NextResponse.json({ error: `Error al cancelar membresía: ${msg}` }, { status: 500 })
  }
}
