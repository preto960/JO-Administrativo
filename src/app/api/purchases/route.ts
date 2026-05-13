import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  try {
    const purchases = await db.purchase.findMany({
      include: {
        supplier: { select: { id: true, name: true, rif: true } },
        currency: true,
        lines: { include: { product: { select: { id: true, name: true, sku: true } } } },
      },
      orderBy: { date: 'desc' },
      take: 50,
    })
    return NextResponse.json(purchases)
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener compras' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { supplierId, lines, currencyId } = body

    if (!supplierId || !lines || lines.length === 0 || !currencyId) {
      return NextResponse.json({ error: 'supplierId, currencyId y lines son requeridos' }, { status: 400 })
    }

    let total = 0
    const purchaseLinesData = lines.map((line: { productId: string; quantity: number; unitCost: number }) => {
      const subtotal = line.quantity * line.unitCost
      total += subtotal
      return {
        productId: line.productId,
        quantity: line.quantity,
        unitCost: line.unitCost,
        subtotal: Math.round(subtotal * 100) / 100,
      }
    })

    total = Math.round(total * 100) / 100

    const purchase = await db.$transaction(async (tx) => {
      const newPurchase = await tx.purchase.create({
        data: {
          supplierId,
          branchId: 'sucursal-1',
          total,
          status: 'recibida',
          currencyId,
          lines: { create: purchaseLinesData },
        },
        include: {
          lines: { include: { product: { select: { id: true, name: true } } } },
          supplier: { select: { id: true, name: true } },
          currency: true,
        },
      })

      // Update inventory and recalculate average cost
      for (const line of lines) {
        const inventory = await tx.inventory.findUnique({
          where: { productId_branchId: { productId: line.productId, branchId: 'sucursal-1' } },
        })
        const product = await tx.product.findUnique({ where: { id: line.productId } })

        if (product) {
          const oldStock = inventory?.stock || 0
          const newStock = oldStock + line.quantity
          const newCostAvg = oldStock > 0
            ? (product.costAvg * oldStock + line.unitCost * line.quantity) / newStock
            : line.unitCost

          if (inventory) {
            await tx.inventory.update({
              where: { id: inventory.id },
              data: { stock: newStock },
            })
          } else {
            // Create inventory record if doesn't exist
            await tx.inventory.create({
              data: {
                productId: line.productId,
                branchId: 'sucursal-1',
                stock: line.quantity,
                minStock: 0,
              },
            })
          }

          await tx.product.update({
            where: { id: line.productId },
            data: { costAvg: Math.round(newCostAvg * 1000) / 1000 },
          })
        }
      }

      // Update supplier balance and create AccountPayable
      await tx.supplier.update({
        where: { id: supplierId },
        data: { balance: { increment: total } },
      })
      await tx.accountPayable.create({
        data: {
          supplierId,
          purchaseId: newPurchase.id,
          amount: total,
          pendingBalance: total,
          status: 'pendiente',
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      })

      return newPurchase
    })

    return NextResponse.json(purchase, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Error al crear compra' }, { status: 500 })
  }
}
