import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { resolveBranchId, branchFromBody } from '@/lib/resolve-branch'
import { notifyUser } from '@/lib/notify'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || ''
    const from = searchParams.get('from') || ''
    const to = searchParams.get('to') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const skip = (page - 1) * limit
    const branchId = await resolveBranchId(request)

    const where: Record<string, unknown> = { branchId }
    if (status) where.status = status
    if (from || to) {
      where.date = {}
      if (from) (where.date as Record<string, unknown>).gte = new Date(from)
      if (to) (where.date as Record<string, unknown>).lte = new Date(to)
    }

    const [sales, total] = await Promise.all([
      db.sale.findMany({
        where,
        include: {
          client: { select: { id: true, name: true } },
          user: { select: { id: true, name: true } },
          payments: { include: { currency: true } },
          lines: { include: { product: { select: { id: true, name: true } } } },
        },
        orderBy: { date: 'desc' },
        skip,
        take: limit,
      }),
      db.sale.count({ where }),
    ])

    return NextResponse.json({
      data: sales,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener ventas' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { clientId, cashRegId, userId, lines, payments } = body

    if (!userId) {
      return NextResponse.json({ error: 'userId es requerido' }, { status: 400 })
    }
    if (!lines || lines.length === 0) {
      return NextResponse.json({ error: 'Debe incluir al menos una línea de venta' }, { status: 400 })
    }

    const branchId = branchFromBody(body) || await resolveBranchId()
    const ivaEnabled = body.ivaEnabled === true
    const ivaRate = Number(body.ivaRate) || 0

    // SERVER-SIDE STOCK VALIDATION (race condition protection)
    const productIds = lines.map((l: { productId: string }) => l.productId)
    const inventories = await db.inventory.findMany({
      where: {
        productId: { in: productIds },
        branchId,
      },
    })
    const inventoryMap = new Map(inventories.map((inv) => [inv.productId, inv]))

    const insufficientStock: string[] = []
    for (const line of lines) {
      const inv = inventoryMap.get(line.productId)
      const availableStock = inv?.stock || 0
      if (line.quantity > availableStock) {
        const product = await db.product.findUnique({ where: { id: line.productId }, select: { name: true } })
        insufficientStock.push(`"${product?.name || line.productId}": solicitado ${line.quantity}, disponible ${availableStock}`)
      }
    }

    if (insufficientStock.length > 0) {
      return NextResponse.json({
        error: `Stock insuficiente: ${insufficientStock.join('; ')}`,
      }, { status: 400 })
    }

    // Fetch product costAvg for each line
    const products = await db.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, costAvg: true, price: true },
    })
    const productMap = new Map(products.map((p) => [p.id, p]))

    // Calculate totals
    let total = 0
    const saleLinesData = lines.map((line: { productId: string; quantity: number; unitPrice: number }) => {
      const product = productMap.get(line.productId)
      const unitCost = product?.costAvg || 0
      const unitPrice = line.unitPrice || product?.price || 0
      const lineTotal = line.quantity * unitPrice
      const lineProfit = line.quantity * (unitPrice - unitCost)
      total += lineTotal
      return {
        productId: line.productId,
        quantity: line.quantity,
        unitPrice,
        unitCost,
        lineTotal: Math.round(lineTotal * 100) / 100,
        lineProfit: Math.round(lineProfit * 100) / 100,
      }
    })

    total = Math.round(total * 100) / 100

    // Add IVA to total if enabled
    let ivaAmount = 0
    if (ivaEnabled && ivaRate > 0) {
      ivaAmount = Math.round(total * (ivaRate / 100) * 100) / 100
      total = Math.round((total + ivaAmount) * 100) / 100
    }

    // Create sale with lines and payments in a transaction
    const sale = await db.$transaction(async (tx) => {
      const newSale = await tx.sale.create({
        data: {
          clientId: clientId || null,
          cashRegId: cashRegId || null,
          userId,
          branchId,
          total,
          status: 'completada',
          lines: { create: saleLinesData },
          payments: {
            create: payments.map((p: { method: string; amount: number; currencyId: string; reference?: string }) => ({
              method: p.method,
              amount: p.amount,
              currencyId: p.currencyId,
              reference: p.reference || null,
            })),
          },
        },
        include: {
          lines: { include: { product: { select: { id: true, name: true } } } },
          payments: { include: { currency: true } },
          client: { select: { id: true, name: true } },
        },
      })

      // Deduct inventory stock for each product
      for (const line of lines) {
        const inventory = await tx.inventory.findUnique({
          where: { productId_branchId: { productId: line.productId, branchId } },
        })
        if (inventory) {
          await tx.inventory.update({
            where: { id: inventory.id },
            data: { stock: { decrement: line.quantity } },
          })
        }
      }

      // Update cash register currentAmt if cash payment
      if (cashRegId) {
        const cashPayments = payments.filter((p: { method: string }) => p.method === 'efectivo')
        const cashTotal = cashPayments.reduce((sum: number, p: { amount: number }) => sum + p.amount, 0)
        if (cashTotal > 0) {
          const reg = await tx.cashRegister.findUnique({ where: { id: cashRegId } })
          if (reg) {
            await tx.cashRegister.update({
              where: { id: cashRegId },
              data: { currentAmt: Math.round((reg.currentAmt + cashTotal) * 100) / 100 },
            })
          }
        }
      }

      // Handle credit sale - create account receivable
      const creditPayments = payments.filter((p: { method: string }) => p.method === 'credito')
      for (const cp of creditPayments) {
        if (clientId) {
          await tx.accountReceivable.create({
            data: {
              clientId,
              saleId: newSale.id,
              amount: cp.amount,
              pendingBalance: cp.amount,
              status: 'pendiente',
              dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
          })
        }
      }

      return newSale
    })

    // After transaction: check low stock and notify (outside tx so Pusher works independently)
    const lowStockProducts: string[] = []
    for (const line of lines) {
      const inv = await db.inventory.findUnique({
        where: { productId_branchId: { productId: line.productId, branchId } },
        include: { product: { select: { name: true } } },
      })
      if (inv && inv.minStock > 0 && inv.stock <= inv.minStock) {
        const msg = `"${inv.product.name}" tiene ${inv.stock} uds (min: ${inv.minStock})`
        if (!lowStockProducts.includes(msg)) lowStockProducts.push(msg)
      }
    }
    if (lowStockProducts.length > 0) {
      const managers = await db.user.findMany({
        where: { role: { in: ['admin', 'gerente'] }, active: true },
        select: { id: true },
      })
      for (const manager of managers) {
        await notifyUser(manager.id, {
          title: `Stock Bajo (${lowStockProducts.length} producto${lowStockProducts.length > 1 ? 's' : ''})`,
          message: lowStockProducts.join('. ') + '. Reposicion necesaria.',
          type: 'warning',
        })
      }
    }

    return NextResponse.json(sale, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Error al crear venta' }, { status: 500 })
  }
}
