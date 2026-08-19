import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/require-auth'
import { logAction } from '@/lib/audit-log'
import { getPaymentMethodsFromDB, FALLBACK_METHODS } from '@/lib/payment-methods'

/**
 * DELETE /api/sales/[id]/renewal
 * 
 * Elimina una venta de renovación de plan/tiquetera y todo lo asociado:
 * - La membresía (ClientMembership) del cliente
 * - La venta (Sale) y sus pagos (SalePayment)
 * - Revierte el monto de la caja si fue pago en efectivo
 * - Elimina la cuenta por cobrar (AccountReceivable) si fue crédito
 * 
 * SOLO administradores pueden ejecutar esta acción.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin()
  if ('status' in auth) return auth

  const { id } = await params

  try {
    // 1. Buscar la venta con toda su info
    const sale = await db.sale.findUnique({
      where: { id },
      include: {
        payments: true,
        lines: true,
        client: { select: { id: true, name: true, lastName: true } },
        cashReg: { select: { id: true, status: true, currentAmt: true } },
        receivables: true,
        user: { select: { id: true, name: true } },
      },
    })

    if (!sale) {
      return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 })
    }

    // 2. Verificar que sea una venta de renovación (sin líneas de producto)
    if (sale.lines.length > 0) {
      return NextResponse.json(
        { error: 'Esta venta no es una renovación de plan. Solo se pueden eliminar renovaciones.' },
        { status: 400 }
      )
    }

    if (!sale.clientId) {
      return NextResponse.json(
        { error: 'Esta venta no está asociada a un cliente.' },
        { status: 400 }
      )
    }

    if (sale.status === 'anulada') {
      return NextResponse.json({ error: 'Esta venta ya fue anulada.' }, { status: 400 })
    }

    // 3. Obtener métodos de pago para identificar efectivo
    const pmList = await getPaymentMethodsFromDB().catch(() => FALLBACK_METHODS)

    // 4. Buscar la membresía asociada a esta venta
    // Buscamos la membresía del cliente cuyo paymentDate coincida con la fecha de la venta (mismo día)
    const saleDate = new Date(sale.date)
    const saleDayStart = new Date(saleDate.getFullYear(), saleDate.getMonth(), saleDate.getDate())
    const saleDayEnd = new Date(saleDayStart)
    saleDayEnd.setDate(saleDayEnd.getDate() + 1)

    // Primero buscar membresía por planType basado en si tiene tickets o no
    // Las renovaciones con tickets tienen planType 'tickets', las demás 'dias' o 'horario'
    const salePayments = sale.payments
    const clientName = sale.client ? `${sale.client.name}${sale.client.lastName ? ' ' + sale.client.lastName : ''}` : 'Desconocido'

    // Ejecutar todo en una transacción
    await db.$transaction(async (tx) => {
      // Buscar membresía del cliente que fue creada/actualizada el día de la venta
      const membership = await tx.clientMembership.findFirst({
        where: {
          clientId: sale.clientId!,
          paymentDate: {
            gte: saleDayStart,
            lt: saleDayEnd,
          },
        },
        orderBy: { createdAt: 'desc' },
      })

      // Eliminar membresía si existe
      if (membership) {
        await tx.clientMembership.delete({
          where: { id: membership.id },
        })
      }

      // Eliminar cuenta por cobrar si existe
      if (sale.receivables.length > 0) {
        for (const rec of sale.receivables) {
          // Eliminar pagos parciales de esta cuenta por cobrar
          await tx.clientPayment.deleteMany({ where: { receivableId: rec.id } })
          await tx.accountReceivable.delete({ where: { id: rec.id } })
        }
      }

      // Revertir caja si hay pagos en efectivo
      if (sale.cashRegId && sale.cashReg && sale.cashReg.status === 'abierta') {
        let cashToSubtract = 0
        for (const payment of salePayments) {
          const pm = pmList.find((m) => m.code === payment.method)
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
        }
      }

      // Eliminar pagos de la venta (CASCADE debería manejarlo, pero por seguridad)
      await tx.salePayment.deleteMany({ where: { saleId: id } })

      // Eliminar la venta
      await tx.sale.delete({ where: { id } })
    })

    // Audit log (fuera de la transacción para no bloquearla)
    await logAction({
      action: 'delete',
      entity: 'sale_renewal',
      entityId: id,
      details: {
        saleId: id,
        clientId: sale.clientId,
        clientName,
        total: sale.total,
        originalTotal: sale.originalTotal,
        discountAmount: sale.discountAmount,
        discountNotes: sale.discountNotes,
        payments: salePayments.map((p) => ({ method: p.method, amount: p.amount })),
        cashRegId: sale.cashRegId,
        hadReceivables: sale.receivables.length > 0,
      },
      request,
    })

    return NextResponse.json({
      message: `Renovación de ${clientName} eliminada correctamente. Venta: ${fmtSaleId(id)}, Total: $${sale.total}`,
    })
  } catch (error) {
    console.error('[DELETE /api/sales/[id]/renewal]', error)
    return NextResponse.json(
      { error: 'Error al eliminar la renovación. ' + (error instanceof Error ? error.message : '') },
      { status: 500 }
    )
  }
}

function fmtSaleId(id: string): string {
  return id.slice(0, 8)
}
