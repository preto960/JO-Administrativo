import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  try {
    const { id: clientId, paymentId } = await params

    // Fetch the payment with its receivable
    const payment = await db.clientPayment.findUnique({
      where: { id: paymentId },
      include: {
        receivable: true,
      },
    })

    if (!payment) {
      return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 })
    }

    if (payment.clientId !== clientId) {
      return NextResponse.json({ error: 'El pago no pertenece a este cliente' }, { status: 403 })
    }

    const result = await db.$transaction(async (tx) => {
      const receivable = payment.receivable

      // Restore the pending balance on the receivable
      const newBalance = Math.round((receivable.pendingBalance + payment.amount) * 100) / 100
      const newStatus = Math.abs(newBalance - receivable.amount) < 0.01 ? 'pendiente' : 'parcial'

      await tx.accountReceivable.update({
        where: { id: receivable.id },
        data: {
          pendingBalance: newBalance,
          status: newStatus,
        },
      })

      // If there was a cash movement, reverse it
      if (payment.cashRegId) {
        const reg = await tx.cashRegister.findUnique({ where: { id: payment.cashRegId } })
        if (reg) {
          await tx.cashRegister.update({
            where: { id: payment.cashRegId },
            data: {
              currentAmt: Math.round((reg.currentAmt - payment.amount) * 100) / 100,
            },
          })

          // Create a reversal cash movement
          await tx.cashMovement.create({
            data: {
              cashRegId: payment.cashRegId,
              userId: payment.userId,
              type: 'salida',
              amount: payment.amount,
              concept: `Anulación cobro a cliente (Pago ID: ${paymentId})`,
              currencyId: receivable.currencyId || '',
            },
          })
        }
      }

      // Delete the payment record
      await tx.clientPayment.delete({
        where: { id: paymentId },
      })

      return {
        restoredAmount: payment.amount,
        newPendingBalance: newBalance,
        newStatus,
        receivableId: receivable.id,
      }
    })

    return NextResponse.json({
      message: 'Pago eliminado. Deuda restaurada correctamente.',
      ...result,
    })
  } catch (error) {
    console.error('[Client Payment DELETE] Error:', error)
    return NextResponse.json({ error: 'Error al eliminar pago' }, { status: 500 })
  }
}