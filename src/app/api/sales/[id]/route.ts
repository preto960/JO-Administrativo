import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { resolveBranchId } from '@/lib/resolve-branch'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const sale = await db.sale.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true, phone: true } },
        user: { select: { id: true, name: true } },
        cashReg: { select: { id: true, openingDate: true } },
        lines: {
          include: {
            product: { select: { id: true, name: true, sku: true } },
          },
        },
        payments: { include: { currency: true } },
        receivables: true,
      },
    })

    if (!sale) {
      return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 })
    }

    return NextResponse.json(sale)
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener venta' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const sale = await db.sale.findUnique({
      where: { id },
      include: { lines: true, payments: true, receivables: true },
    })

    if (!sale) {
      return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 })
    }

    if (sale.status === 'anulada') {
      return NextResponse.json({ error: 'La venta ya fue anulada' }, { status: 400 })
    }

    // Check if sale has receivables with actual payments made
    const hasPaidReceivable = sale.receivables.some(r => r.amount - r.pendingBalance > 0.005)
    if (hasPaidReceivable) {
      return NextResponse.json({ error: 'No se puede anular una venta a crédito que ya tiene pagos realizados. Elimine los pagos primero.' }, { status: 400 })
    }

    const updatedSale = await db.$transaction(async (tx) => {
      // Restore inventory
      for (const line of sale.lines) {
        const inventory = await tx.inventory.findUnique({
          where: { productId_branchId: { productId: line.productId, branchId: sale.branchId } },
        })
        if (inventory) {
          await tx.inventory.update({
            where: { id: inventory.id },
            data: { stock: { increment: line.quantity } },
          })
        }
      }

      // Cancel receivables (client pendingBalance is computed from receivables, no need to update)
      for (const rec of sale.receivables) {
        if (rec.status === 'pendiente' || rec.status === 'parcial') {
          await tx.accountReceivable.update({
            where: { id: rec.id },
            data: { status: 'cancelada', pendingBalance: 0 },
          })
        }
      }

      return tx.sale.update({
        where: { id },
        data: { status: 'anulada' },
      })
    })

    return NextResponse.json(updatedSale)
  } catch (error) {
    return NextResponse.json({ error: 'Error al anular venta' }, { status: 500 })
  }
}
