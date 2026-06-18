import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; receivableId: string }> }
) {
  try {
    const { id: clientId, receivableId } = await params

    // Fetch the receivable
    const receivable = await db.accountReceivable.findUnique({
      where: { id: receivableId },
      include: {
        payments: true,
        sale: {
          select: {
            branchId: true,
            payments: true,
            lines: true,
          },
        },
      },
    })

    if (!receivable) {
      return NextResponse.json({ error: 'Cuenta por cobrar no encontrada' }, { status: 404 })
    }

    if (receivable.clientId !== clientId) {
      return NextResponse.json({ error: 'La cuenta por cobrar no pertenece a este cliente' }, { status: 403 })
    }

    // Only allow removing if there are no payments made against it
    const totalPaid = receivable.payments.reduce((sum, p) => sum + p.amount, 0)
    if (totalPaid > 0) {
      return NextResponse.json({
        error: `No se puede eliminar esta deuda porque ya tiene pagos registrados (${totalPaid}). Elimine los pagos primero.`,
      }, { status: 400 })
    }

    const result = await db.$transaction(async (tx) => {
      // Check if the sale only has this receivable as payment (credit-only sale)
      const sale = receivable.sale
      const isCreditOnlySale = sale.payments.length === 0

      // Delete the receivable
      await tx.accountReceivable.delete({
        where: { id: receivableId },
      })

      // If the sale was credit-only (no other payments), also delete the sale and its lines
      // and restore inventory stock
      let saleDeleted = false
      if (isCreditOnlySale) {
        // Restore inventory stock for each line
        for (const line of sale.lines) {
          await tx.inventory.updateMany({
            where: { productId: line.productId, branchId: sale.branchId },
            data: { stock: { increment: line.quantity } },
          })
        }

        // Delete sale lines first (FK constraint)
        await tx.saleLine.deleteMany({ where: { saleId: sale.id } })

        // Delete the sale
        await tx.sale.delete({ where: { id: sale.id } })
        saleDeleted = true
      }

      return {
        deletedAmount: receivable.amount,
        saleDeleted,
        saleId: sale.id,
      }
    })

    return NextResponse.json({
      message: result.saleDeleted
        ? 'Deuda y venta asociada eliminadas correctamente. Inventario restaurado.'
        : 'Deuda eliminada correctamente.',
      ...result,
    })
  } catch (error) {
    console.error('[Receivable DELETE] Error:', error)
    return NextResponse.json({ error: 'Error al eliminar deuda' }, { status: 500 })
  }
}