import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { amount } = body

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'El monto debe ser mayor a 0' }, { status: 400 })
    }

    const supplier = await db.supplier.findUnique({ where: { id } })
    if (!supplier) {
      return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 404 })
    }

    // Find pending payables and reduce them
    const payables = await db.accountPayable.findMany({
      where: { supplierId: id, status: 'pendiente' },
      orderBy: { createdAt: 'asc' },
    })

    let remaining = amount
    for (const payable of payables) {
      if (remaining <= 0) break
      const deduction = Math.min(remaining, payable.pendingBalance)
      await db.accountPayable.update({
        where: { id: payable.id },
        data: {
          pendingBalance: { decrement: deduction },
          status: payable.pendingBalance - deduction <= 0 ? 'pagada' : 'parcial',
        },
      })
      remaining -= deduction
    }

    // Update supplier balance
    const actualDeduction = amount - remaining
    await db.supplier.update({
      where: { id },
      data: { balance: { decrement: actualDeduction } },
    })

    return NextResponse.json({ success: true, deducted: actualDeduction })
  } catch (error) {
    return NextResponse.json({ error: 'Error al registrar pago' }, { status: 500 })
  }
}
