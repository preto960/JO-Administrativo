import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { logAction } from '@/lib/audit-log'

/**
 * DELETE /api/sales/[id]/lines/[lineId]
 * Remove a single sale line and restore its inventory stock.
 * Only allowed for admin/gerente users on completed (non-anulled) sales.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; lineId: string }> }
) {
  const auth = await requireAuth()
  if ('status' in auth) return auth

  // Only admin or gerente can remove sale lines
  if (auth.role !== 'admin' && auth.role !== 'gerente') {
    return NextResponse.json({ error: 'Solo administradores o gerentes pueden eliminar detalles de venta' }, { status: 403 })
  }

  const { id: saleId, lineId } = await params

  try {
    // Fetch the sale with the specific line
    const sale = await db.sale.findUnique({
      where: { id: saleId },
      include: {
        lines: { where: { id: lineId } },
      },
    })

    if (!sale) {
      return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 })
    }

    if (sale.status === 'anulada') {
      return NextResponse.json({ error: 'No se puede modificar una venta anulada' }, { status: 400 })
    }

    // Check if sale has receivables with actual payments made (amount paid > 0)
    const receivableWithPayments = await db.accountReceivable.findFirst({
      where: { saleId },
    })
    if (receivableWithPayments && receivableWithPayments.amount - receivableWithPayments.pendingBalance > 0.005) {
      return NextResponse.json({ error: 'No se puede eliminar detalles de una venta a crédito que ya tiene pagos realizados. Elimine los pagos primero.' }, { status: 400 })
    }

    if (sale.lines.length === 0) {
      return NextResponse.json({ error: 'Detalle de venta no encontrado' }, { status: 404 })
    }

    const line = sale.lines[0]

    // Get all remaining lines count (including this one)
    const totalLines = await db.saleLine.count({ where: { saleId } })
    if (totalLines <= 1) {
      return NextResponse.json({ error: 'No se puede eliminar el último detalle. Anule la venta completa si desea deshacerla.' }, { status: 400 })
    }

    const result = await db.$transaction(async (tx) => {
      // 1. Restore inventory for this line's product
      const inventory = await tx.inventory.findUnique({
        where: {
          productId_branchId: {
            productId: line.productId,
            branchId: sale.branchId,
          },
        },
      })
      if (inventory) {
        await tx.inventory.update({
          where: { id: inventory.id },
          data: { stock: { increment: line.quantity } },
        })
      }

      // 2. Delete the sale line
      await tx.saleLine.delete({ where: { id: lineId } })

      // 3. Recalculate sale total from remaining lines
      const remainingLines = await tx.saleLine.findMany({
        where: { saleId },
      })
      const newTotal = remainingLines.reduce((sum, l) => sum + l.lineTotal, 0)

      // 4. Update sale total
      const updatedSale = await tx.sale.update({
        where: { id: saleId },
        data: { total: newTotal },
      })

      // 5. Adjust receivable if exists
      const receivable = await tx.accountReceivable.findFirst({
        where: { saleId, status: { in: ['pendiente', 'parcial'] } },
      })
      if (receivable) {
        const totalPaid = receivable.amount - receivable.pendingBalance
        const newPending = Math.max(0, newTotal - totalPaid)
        const newStatus = newPending <= 0 ? 'pagada' : totalPaid > 0 ? 'parcial' : 'pendiente'

        await tx.accountReceivable.update({
          where: { id: receivable.id },
          data: {
            amount: newTotal,
            pendingBalance: newPending,
            status: newStatus,
          },
        })

        // If fully paid, also update client pending balance
        if (newStatus === 'pagada') {
          const client = await tx.client.findUnique({ where: { id: sale.clientId! } })
          if (client) {
            await tx.client.update({
              where: { id: client.id },
              data: { pendingBalance: { decrement: newPending } },
            })
          }
        }
      }

      return { sale: updatedSale, removedLine: line, newTotal, stockRestored: !!inventory }
    })

    // Audit log
    await logAction({
      action: 'delete',
      entity: 'sale_line',
      entityId: lineId,
      details: {
        saleId,
        productId: line.productId,
        quantity: line.quantity,
        lineTotal: line.lineTotal,
        newSaleTotal: result.newTotal,
        stockRestored: result.stockRestored,
      },
      userId: auth.userId,
    })

    return NextResponse.json({
      message: 'Detalle eliminado y stock restaurado',
      newTotal: result.newTotal,
      stockRestored: result.stockRestored,
    })
  } catch (error) {
    console.error('[SaleLine DELETE]', error)
    return NextResponse.json({ error: 'Error al eliminar detalle de venta' }, { status: 500 })
  }
}
