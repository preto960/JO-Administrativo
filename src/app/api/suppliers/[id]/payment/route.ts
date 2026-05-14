import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { amount, method, reference, cashRegId, userId, currencyId } = body

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'El monto debe ser mayor a 0' }, { status: 400 })
    }

    const supplier = await db.supplier.findUnique({ where: { id } })
    if (!supplier) {
      return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 404 })
    }

    if (amount > supplier.balance) {
      return NextResponse.json({ error: `El monto no puede ser mayor al balance ($${supplier.balance.toFixed(2)})` }, { status: 400 })
    }

    const result = await db.$transaction(async (tx) => {
      // Find pending payables and reduce them
      const payables = await tx.accountPayable.findMany({
        where: { supplierId: id, status: 'pendiente' },
        orderBy: { createdAt: 'asc' },
      })

      let remaining = amount
      const paymentRecords: { payableId: string; deduction: number }[] = []

      for (const payable of payables) {
        if (remaining <= 0) break
        const deduction = Math.min(remaining, payable.pendingBalance)
        await tx.accountPayable.update({
          where: { id: payable.id },
          data: {
            pendingBalance: { decrement: deduction },
            status: payable.pendingBalance - deduction <= 0 ? 'pagada' : 'parcial',
          },
        })
        paymentRecords.push({ payableId: payable.id, deduction })
        remaining -= deduction
      }

      const actualDeduction = amount - remaining

      // Update supplier balance
      await tx.supplier.update({
        where: { id },
        data: { balance: { decrement: actualDeduction } },
      })

      // Create payment record for audit trail
      const payment = await tx.supplierPayment.create({
        data: {
          supplierId: id,
          amount: actualDeduction,
          method: method || 'efectivo',
          reference: reference || null,
          cashRegId: cashRegId || null,
          userId: userId || '',
        },
        include: {
          user: { select: { name: true } },
        },
      })

      // If a cash register is specified, create a cash movement (salida)
      if (cashRegId) {
        const reg = await tx.cashRegister.findUnique({ where: { id: cashRegId } })
        if (reg && reg.status === 'abierta') {
          await tx.cashMovement.create({
            data: {
              cashRegId,
              type: 'salida',
              amount: actualDeduction,
              concept: `Pago a proveedor: ${supplier.name}`,
              currencyId: currencyId || '',
              userId: userId || '',
            },
          })
          await tx.cashRegister.update({
            where: { id: cashRegId },
            data: { currentAmt: Math.round((reg.currentAmt - actualDeduction) * 100) / 100 },
          })
        }
      }

      return { payment, actualDeduction, remaining }
    })

    return NextResponse.json({
      success: true,
      deducted: result.actualDeduction,
      remaining: result.remaining,
      payment: result.payment,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Error al registrar pago' }, { status: 500 })
  }
}
