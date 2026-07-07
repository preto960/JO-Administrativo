import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { resolveBranchId } from '@/lib/resolve-branch'
import { logAction } from '@/lib/audit-log'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clientId } = await params
    const body = await request.json()
    const { lines, userId, branchId: bodyBranchId } = body

    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json({ error: 'Debe incluir al menos un producto' }, { status: 400 })
    }

    if (!userId) {
      return NextResponse.json({ error: 'userId es requerido' }, { status: 400 })
    }

    const client = await db.client.findUnique({ where: { id: clientId } })
    if (!client) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
    }

    const branchId = bodyBranchId || await resolveBranchId()

    const result = await db.$transaction(async (tx) => {
      let totalAmount = 0
      const saleLinesData = []
      const inventoryLogs: { productId: string; productName: string; qty: number; before: number; after: number }[] = []

      for (const line of lines) {
        const product = await tx.product.findUnique({
          where: { id: line.productId },
          include: { inventories: { where: { branchId } } },
        })

        if (!product) {
          throw new Error(`Producto no encontrado: ${line.productId}`)
        }

        const inventory = product.inventories[0]
        const unitPrice = line.unitPrice || product.price
        const lineTotal = Math.round(unitPrice * line.quantity * 100) / 100

        if (!inventory) {
          throw new Error(`Inventario no configurado para "${product.name}" en esta sucursal. Configure el inventario antes de despachar.`)
        }

        if (line.quantity > inventory.stock) {
          throw new Error(`Stock insuficiente para "${product.name}". Disponible: ${inventory.stock}, Solicitado: ${line.quantity}`)
        }

        // Deduct stock (inventory existence validated above)
        const beforeStock = inventory.stock
        await tx.inventory.update({
          where: { id: inventory.id },
          data: { stock: { decrement: line.quantity } },
        })
        inventoryLogs.push({
          productId: line.productId,
          productName: product.name,
          qty: line.quantity,
          before: beforeStock,
          after: Math.round((beforeStock - line.quantity) * 100) / 100,
        })

        totalAmount += lineTotal
        saleLinesData.push({
          productId: line.productId,
          quantity: line.quantity,
          unitPrice,
          unitCost: product.costAvg,
          lineTotal,
          lineProfit: Math.round((unitPrice - product.costAvg) * line.quantity * 100) / 100,
        })
      }

      totalAmount = Math.round(totalAmount * 100) / 100

      // Create the sale
      const sale = await tx.sale.create({
        data: {
          clientId,
          userId,
          branchId,
          total: totalAmount,
          status: 'completada',
          currencyId: '',
          lines: {
            create: saleLinesData,
          },
        },
        include: {
          lines: { include: { product: { select: { name: true } } } },
        },
      })

      // Create AccountReceivable (credit - 30 day due)
      const dueDate = new Date()
      dueDate.setDate(dueDate.getDate() + 30)

      await tx.accountReceivable.create({
        data: {
          clientId,
          saleId: sale.id,
          amount: totalAmount,
          pendingBalance: totalAmount,
          dueDate,
          status: 'pendiente',
        },
      })

      return { sale, inventoryLogs }
    })

    // Audit log for inventory deduction (fire-and-forget)
    if (result.inventoryLogs.length > 0) {
      logAction({
        action: 'create',
        entity: 'inventory_deduction',
        entityId: result.sale.id,
        details: {
          summary: `Despacho crédito ${result.sale.id.slice(0, 8)}: inventario descontado`,
          saleId: result.sale.id,
          clientId,
          branchId,
          deductions: result.inventoryLogs,
        },
        request,
      }).catch(() => {})
    }

    return NextResponse.json(result.sale, { status: 201 })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error al registrar despacho'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}